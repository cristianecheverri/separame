import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useBlocker } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type AvailabilitySettingsResponse, type BlockResponse, type PutAvailabilityRequest } from '@shared/api';
import { createBlockSchema } from '@shared/schemas';
import { addDays, todayBogota, toInstant } from '@shared/time';
import type { AvailabilitySettings, Block, BookingRules } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { Field } from '../../components/ui/Field';
import { CloseIcon, LockIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { PillSelect } from '../../components/ui/PillSelect';
import { SectionSkeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { focusFirstError } from '../../lib/focusError';
import { now } from '../../lib/clock';
import { formatBlockRange, formatDayShortMonth, isFullDayBlock } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { keys, useAvailability } from '../../lib/queries';
import { formatTime } from '@shared/format';
import { scheduleErrors, timeStepsWith, toDraft, toSchedule, type ScheduleDraft } from './scheduleModel';
import { WeeklyScheduleEditor } from './WeeklyScheduleEditor';

const withCurrent = (options: { value: number; label: string }[], value: number, label: (v: number) => string) =>
  options.some((o) => o.value === value) ? options : [...options, { value, label: label(value) }].sort((a, b) => a.value - b.value);

const minLabel = (m: number) => (m === 0 ? 'Sin margen' : `${m} min`);
const noticeLabel = (m: number) => {
  if (m === 0) return 'Sin mínimo';
  if (m < 60) return `${m} min`;
  if (m < 1440) return m === 60 ? '1 hora' : `${m / 60} horas`;
  return m === 1440 ? '1 día' : `${m / 1440} días`;
};
const daysLabel = (d: number) => `${d} días`;

const BUFFER = [0, 5, 10, 15, 20, 30, 45, 60].map((v) => ({ value: v, label: minLabel(v) }));
const NOTICE = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880].map((v) => ({ value: v, label: noticeLabel(v) }));
const AHEAD = [7, 14, 30, 60, 90, 120, 180, 365].map((v) => ({ value: v, label: daysLabel(v) }));

/** pro-availability */
export function AvailabilityPage() {
  const availability = useAvailability();
  if (!availability.data) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Disponibilidad</h1>
          <div className="text-[15px] text-muted">Cuándo pueden reservarte. Todo en hora de Colombia.</div>
        </div>
        <div className="flex flex-wrap gap-6 items-start">
          <SectionSkeleton rows={7} className="flex-[999_1_480px] min-w-0" />
          <SectionSkeleton rows={3} className="flex-[1_1_320px] min-w-0" />
        </div>
      </div>
    );
  }
  return <AvailabilityForm data={availability.data} />;
}

function AvailabilityForm({ data }: { data: AvailabilitySettingsResponse }) {
  const { readOnly } = usePro();
  const toast = useToast();
  const qc = useQueryClient();
  const [baseline, setBaseline] = useState<Pick<AvailabilitySettings, 'schedule' | 'rules'>>(() => ({ schedule: data.settings.schedule, rules: data.settings.rules }));
  const [draft, setDraft] = useState<ScheduleDraft>(() => toDraft(data.settings.schedule));
  const [rules, setRules] = useState<BookingRules>(data.settings.rules);
  const [showErrors, setShowErrors] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const dirty = JSON.stringify(toSchedule(draft)) !== JSON.stringify(baseline.schedule) || JSON.stringify(rules) !== JSON.stringify(baseline.rules);
  const errors = scheduleErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;

  const save = useMutation({
    mutationFn: (body: PutAvailabilityRequest) => api.put<AvailabilitySettingsResponse>(apiPaths.availability(), body),
    onSuccess: (res) => {
      qc.setQueryData(keys.availability, res);
      void qc.invalidateQueries({ queryKey: keys.slotsAll });
      setBaseline({ schedule: res.settings.schedule, rules: res.settings.rules });
      setDraft(toDraft(res.settings.schedule));
      setRules(res.settings.rules);
      setShowErrors(false);
      toast.success('Listo, tu disponibilidad quedó guardada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const refreshBlocks = () => {
    void qc.invalidateQueries({ queryKey: keys.availability });
    void qc.invalidateQueries({ queryKey: keys.slotsAll });
  };
  const restoreBlock = useMutation({
    mutationFn: (block: Block) => api.post<BlockResponse>(apiPaths.blocks(), { label: block.label, start: block.start, end: block.end }),
    onSuccess: (_res, block) => {
      refreshBlocks();
      toast.success(`Volviste a bloquear «${block.label}».`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const removeBlock = useMutation({
    mutationFn: (block: Block) => api.del(apiPaths.block(block.id)),
    onSuccess: (_res, block) => {
      refreshBlocks();
      toast.show(`Quitaste «${block.label}». Ya se puede reservar en esas fechas.`, 'success', { label: 'Deshacer', onClick: () => restoreBlock.mutate(block) });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const submit = () => {
    if (readOnly) return;
    if (!dirty) {
      toast.show('No hay cambios por guardar.');
      return;
    }
    if (hasErrors) {
      setShowErrors(true);
      toast.error('Revisa el horario: hay franjas que no son válidas.');
      return;
    }
    save.mutate({ schedule: toSchedule(draft), rules });
  };

  // Unsaved changes: warn before leaving the page or the app.
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirty && !readOnly && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const saveButton = (
    <button type="button" onClick={submit} disabled={readOnly || save.isPending} className={cx(ui.btnPrimary, 'px-[22px]', readOnly && ui.btnLocked)}>
      {readOnly && <LockIcon size={16} />}
      {save.isPending ? 'Guardando…' : 'Guardar cambios'}
    </button>
  );
  const blocks = data.settings.blocks;

  return (
    <div className={cx('flex flex-col gap-6', dirty && 'pb-20 lg:pb-0')}>
      <div className="flex flex-wrap gap-4 justify-between items-end">
        <div className="flex flex-col gap-1">
          <h1 className={ui.h1}>Disponibilidad</h1>
          <div className="text-[15px] text-muted">Cuándo pueden reservarte. Todo en hora de Colombia.</div>
        </div>
        <div className="flex items-center gap-3">
          {dirty && <span className="text-[13px] font-bold text-warn-ink">Cambios sin guardar</span>}
          {saveButton}
        </div>
      </div>

      <div className="flex flex-wrap gap-6 items-start">
        <section className={cx(ui.card, 'flex-[999_1_480px] min-w-0 gap-1')}>
          <h2 className={cx(ui.h2, 'mb-[10px]')}>Horario semanal</h2>
          <WeeklyScheduleEditor value={draft} onChange={setDraft} errors={showErrors ? errors : {}} readOnly={readOnly} />
        </section>

        <div className="flex-[1_1_320px] min-w-0 flex flex-col gap-5">
          <section className={cx(ui.card, 'gap-[14px]')}>
            <h2 className={ui.h2sm}>Reglas de reserva</h2>
            {(
              [
                ['Tiempo entre citas', 'Para descansar o preparar', 'bufferMin', withCurrent(BUFFER, rules.bufferMin, minLabel)],
                ['Anticipación mínima', 'Nadie reserva para dentro de menos', 'minNoticeMin', withCurrent(NOTICE, rules.minNoticeMin, noticeLabel)],
                ['Reservar hasta', 'Qué tan adelante ven tu agenda', 'maxDaysAhead', withCurrent(AHEAD, rules.maxDaysAhead, daysLabel)],
              ] as const
            ).map(([label, help, key, options]) => (
              <div key={key} className="flex justify-between items-center gap-3">
                <div className="flex flex-col gap-[2px] min-w-0">
                  <span className="font-bold text-[14px]">{label}</span>
                  <span className="text-[12px] text-muted">{help}</span>
                </div>
                <PillSelect label={label} value={rules[key]} options={[...options]} disabled={readOnly} onChange={(v) => setRules({ ...rules, [key]: v })} className="shrink-0" />
              </div>
            ))}
          </section>

          <section className={cx(ui.card, 'gap-3')}>
            <div className="flex justify-between items-center gap-3">
              <h2 className={ui.h2sm}>Festivos de Colombia</h2>
              <Switch on={rules.closedOnHolidays} label="Cerrar en festivos" disabled={readOnly} onToggle={() => setRules({ ...rules, closedOnHolidays: !rules.closedOnHolidays })} />
            </div>
            <div className="text-[13px] text-muted">{rules.closedOnHolidays ? 'Tu agenda se cierra sola en estos días.' : 'Atiendes también en festivos.'}</div>
            <ul className="m-0 p-0 list-none flex flex-col gap-3">
              {data.upcomingHolidays.map((h) => (
                <li key={h.date} className="flex justify-between gap-3 text-[14px] py-1">
                  <span className="font-semibold whitespace-nowrap">{formatDayShortMonth(h.date)}</span>
                  <span className="text-muted text-right">{h.name}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className={cx(ui.card, 'gap-3')}>
            <div className="flex justify-between items-center">
              <h2 className={ui.h2sm}>Días bloqueados</h2>
              <button type="button" disabled={readOnly} onClick={() => setBlockOpen(true)} className={cx(ui.linkBtn, 'text-[14px] min-h-11 underline underline-offset-2 disabled:text-muted disabled:cursor-not-allowed')}>
                + Agregar
              </button>
            </div>
            {blocks.length === 0 && <div className="text-[13px] text-muted">Vacaciones, congresos o días libres: nadie podrá reservar en esas fechas.</div>}
            {blocks.map((b) => (
              <BlockItem key={b.id} block={b} readOnly={readOnly} onRemove={() => removeBlock.mutate(b)} />
            ))}
          </section>
        </div>
      </div>

      {dirty && !readOnly && (
        <div className="lg:hidden fixed bottom-[var(--bottom-nav)] inset-x-0 z-20 bg-white border-t border-line px-4 py-3 flex items-center justify-between gap-3 pb-[max(12px,calc(env(safe-area-inset-bottom)-var(--bottom-nav)))]">
          <span className="text-[14px] font-bold text-warn-ink">Cambios sin guardar</span>
          {saveButton}
        </div>
      )}

      {blockOpen && <BlockModal onClose={() => setBlockOpen(false)} />}

      <Modal
        open={blocker.state === 'blocked'}
        onClose={() => blocker.reset?.()}
        title="Tienes cambios sin guardar"
        description="Si sales ahora, se pierden los cambios de tu horario."
        footer={
          <>
            <button type="button" onClick={() => blocker.reset?.()} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] grow sm:grow-0" data-autofocus>
              Seguir editando
            </button>
            <button type="button" onClick={() => blocker.proceed?.()} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0">
              Salir sin guardar
            </button>
          </>
        }
      >
        <span className="sr-only">Confirmación</span>
      </Modal>
    </div>
  );
}

function BlockItem({ block, readOnly, onRemove }: { block: Block; readOnly: boolean; onRemove: () => void }) {
  const multiDay = isFullDayBlock(block) && new Date(block.end).getTime() - new Date(block.start).getTime() > 86_400_000;
  return (
    <div className={cx('rounded-[16px] py-3 pl-[14px] pr-2 flex items-center gap-2', multiDay ? 'bg-accent-soft' : 'bg-surface')}>
      <div className="flex flex-col gap-[2px] grow min-w-0">
        <span className="font-bold text-[14px] [overflow-wrap:anywhere]">{block.label}</span>
        <span className="text-[13px] text-ink-2">{formatBlockRange(block)}</span>
      </div>
      {!readOnly && (
        <button type="button" onClick={onRemove} aria-label={`Quitar bloqueo «${block.label}»`} className={ui.iconBtn}>
          <CloseIcon size={16} />
        </button>
      )}
    </div>
  );
}

function BlockModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const today = todayBogota(now());
  const [label, setLabel] = useState('');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('12:00');
  const [error, setErrorState] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const setError = (message: string | null) => {
    setErrorState(message);
    if (message) focusFirstError(formRef.current);
  };

  const create = useMutation({
    mutationFn: (body: { label: string; start: string; end: string }) => api.post<BlockResponse>(apiPaths.blocks(), body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: keys.availability });
      void qc.invalidateQueries({ queryKey: keys.slotsAll });
      toast.success('Bloqueo agregado.');
      onClose();
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const body = {
      label,
      start: toInstant(from, allDay ? '00:00' : startTime),
      end: allDay ? toInstant(addDays(to < from ? from : to, 1), '00:00') : toInstant(to < from ? from : to, endTime),
    };
    const parsed = createBlockSchema.safeParse(body);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
    setError(null);
    create.mutate(parsed.data);
  };

  const timeOptions = (current: string) => timeStepsWith(current).map((t) => ({ value: t, label: formatTime(t) }));
  return (
    <Modal
      open
      onClose={onClose}
      title="Bloquear días"
      description="Nadie podrá reservar en estas fechas. Las citas que ya tengas no cambian."
      footer={
        <>
          <button type="submit" form="block-form" disabled={create.isPending} className="h-12 px-6 rounded-full bg-primary text-white font-bold text-[15px] grow sm:grow-0 hover:bg-primary-dark">
            {create.isPending ? 'Guardando…' : 'Bloquear'}
          </button>
          <button type="button" onClick={onClose} className="h-12 px-5 rounded-full border-2 border-line-strong bg-white font-bold text-[15px] grow sm:grow-0">
            Volver
          </button>
        </>
      }
    >
      <form id="block-form" ref={formRef} onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label="Nombre">{(p) => <input {...p} className={ui.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Nombre del bloqueo" />}</Field>
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
          <Field label="Desde">{(p) => <input {...p} type="date" min={today} className={ui.input} value={from} onChange={(e) => setFrom(e.target.value)} />}</Field>
          <Field label="Hasta">{(p) => <input {...p} type="date" min={from} className={ui.input} value={to} onChange={(e) => setTo(e.target.value)} />}</Field>
        </div>
        <label className="flex gap-3 items-center text-[14px] min-h-11 cursor-pointer">
          <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} className="w-[22px] h-[22px] m-0 accent-primary shrink-0" />
          Todo el día
        </label>
        {!allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-[6px]">
              <span className={ui.label}>Hora inicial</span>
              <PillSelect variant="field" label="Hora inicial" value={startTime} options={timeOptions(startTime)} onChange={setStartTime} />
            </div>
            <div className="flex flex-col gap-[6px]">
              <span className={ui.label}>Hora final</span>
              <PillSelect variant="field" label="Hora final" value={endTime} options={timeOptions(endTime)} onChange={setEndTime} />
            </div>
          </div>
        )}
        {error && (
          <div className="text-[13px] font-semibold text-warn-ink" role="alert">
            {error}
          </div>
        )}
      </form>
    </Modal>
  );
}
