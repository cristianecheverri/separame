import { useEffect, useState } from 'react';
import { useBlocker } from 'react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type AvailabilitySettingsResponse, type PutAvailabilityRequest } from '@shared/api';
import type { AvailabilitySettings, Block, BookingRules } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { CloseIcon, LockIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { PillSelect } from '../../components/ui/PillSelect';
import { SectionSkeleton } from '../../components/ui/Skeleton';
import { ui } from '../../components/ui/styles';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { api, errorMessage } from '../../lib/api';
import { formatBlockRange, formatDayShortMonth, isFullDayBlock } from '../../lib/format';
import { usePro } from '../../lib/pro';
import { keys, useActing, useAvailability } from '../../lib/queries';
import { ProSelector } from '../team/ProSelector';
import { sameSchedule, type ScheduleDraft, scheduleErrors, stableJson, toDraft, toSchedule } from './scheduleModel';
import { BlockSheet } from './BlockSheet';
import { useBlocks } from './useBlocks';
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
  const { proId } = useActing();
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
  // Keyed by professional (team plan): another member's schedule starts a fresh draft.
  return <AvailabilityForm key={proId} data={availability.data} />;
}

function AvailabilityForm({ data }: { data: AvailabilitySettingsResponse }) {
  const { readOnly } = usePro();
  const toast = useToast();
  const qc = useQueryClient();
  const { proId, header } = useActing();
  const acting = { actingProId: header };
  const [baseline, setBaseline] = useState<Pick<AvailabilitySettings, 'schedule' | 'rules'>>(() => ({ schedule: data.settings.schedule, rules: data.settings.rules }));
  const [draft, setDraft] = useState<ScheduleDraft>(() => toDraft(data.settings.schedule));
  const [rules, setRules] = useState<BookingRules>(data.settings.rules);
  const [showErrors, setShowErrors] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const dirty = !sameSchedule(toSchedule(draft), baseline.schedule) || stableJson(rules) !== stableJson(baseline.rules);
  const errors = scheduleErrors(draft);
  const hasErrors = Object.keys(errors).length > 0;

  const save = useMutation({
    mutationFn: (body: PutAvailabilityRequest) => api.put<AvailabilitySettingsResponse>(apiPaths.availability(), body, acting),
    onSuccess: (res) => {
      qc.setQueryData(keys.availability(proId), res);
      void qc.invalidateQueries({ queryKey: keys.slotsAll });
      setBaseline({ schedule: res.settings.schedule, rules: res.settings.rules });
      setDraft(toDraft(res.settings.schedule));
      setRules(res.settings.rules);
      setShowErrors(false);
      toast.success('Listo, tu disponibilidad quedó guardada.');
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  const { remove: removeBlock } = useBlocks();

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
      <ProSelector variant="inline" allowAll={false} className="hidden lg:flex" />

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

      {blockOpen && <BlockSheet onClose={() => setBlockOpen(false)} />}

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
