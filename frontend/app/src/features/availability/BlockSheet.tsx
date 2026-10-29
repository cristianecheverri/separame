import { useMemo, useState, type FormEvent } from 'react';
import { createBlockSchema } from '@shared/schemas';
import { capitalize, formatDayLong, formatInstantTime, formatTime } from '@shared/format';
import { bogotaDate, todayBogota, type HHmm, type ISODate } from '@shared/time';
import { Chip } from '../../components/ui/Chip';
import { Field } from '../../components/ui/Field';
import { AlertIcon, CalendarIcon } from '../../components/ui/icons';
import { Modal } from '../../components/ui/Modal';
import { PillSelect } from '../../components/ui/PillSelect';
import { ui } from '../../components/ui/styles';
import { Switch } from '../../components/ui/Switch';
import { useToast } from '../../components/ui/Toast';
import { errorMessage } from '../../lib/api';
import { now } from '../../lib/clock';
import { formatDayShortMonth } from '../../lib/format';
import { useAgendaAppointments, useAvailability } from '../../lib/queries';
import { timeStepsWith } from './scheduleModel';
import {
  WHEN_OPTIONS, blockRequest, coveredAppointments, firstDay, hourPresets, initialDraft, blockSummary, type BlockDraft, type BlockWhen,
} from './blockModel';
import { useBlocks } from './useBlocks';

export interface BlockPrefill {
  date: ISODate;
  startTime: HHmm;
  endTime: HHmm;
}

/** «No estaré disponible» (proposal block-hours-sheet-phone): from the agenda («+», «Bloquear» on a free gap) and Disponibilidad. */
export function BlockSheet({ prefill, onClose }: { prefill?: BlockPrefill; onClose: () => void }) {
  const clock = now();
  const today = todayBogota(clock);
  const toast = useToast();
  const { create } = useBlocks();
  const schedule = useAvailability().data?.settings.schedule;
  const [draft, setDraft] = useState<BlockDraft>(() => initialDraft(today, clock, prefill));
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<BlockDraft>) => {
    setError(null);
    setDraft((d) => ({ ...d, ...patch }));
  };

  const day = firstDay(draft, today);
  const range = draft.when === 'range';
  const lastDay = range ? draft.to : day;
  const request = blockRequest(draft, today);
  const appointments = useAgendaAppointments(day, lastDay < day ? day : lastDay).data?.appointments;
  const covered = useMemo(() => (request && appointments ? coveredAppointments(request, appointments) : []), [request, appointments]);
  const presets = draft.allDay ? [] : hourPresets(day, schedule, today, clock, draft.when === 'range');
  const timeOptions = (current: string) => timeStepsWith(current).map((t) => ({ value: t, label: formatTime(t) }));

  const pickWhen = (when: BlockWhen) => set({ when, allDay: when === 'range' ? true : draft.when === 'range' ? false : draft.allDay });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!request) return setError(draft.allDay || range ? 'Revisa los días: el último no puede ser antes del primero.' : 'La hora final debe ser después de la inicial.');
    const parsed = createBlockSchema.safeParse(request);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Revisa los datos.');
    create.mutate(parsed.data, {
      onSuccess: () => {
        toast.success('Listo: nadie podrá reservar en ese horario.');
        onClose();
      },
      onError: (err) => setError(errorMessage(err)),
    });
  };

  const dayLabel = draft.when === 'today' ? `Hoy · ${formatDayLong(day)}` : draft.when === 'tomorrow' ? `Mañana · ${formatDayLong(day)}` : capitalize(formatDayLong(day));
  const first = covered[0];
  return (
    <Modal
      open
      onClose={onClose}
      title="No estaré disponible"
      description="Nadie podrá reservar en ese rango. Tus citas no cambian."
      footer={
        <div className="w-full flex flex-col gap-2">
          <div id="block-summary" className="text-center text-[14px] font-semibold text-ink-2" aria-live="polite">
            {blockSummary(draft, today)}
          </div>
          <button
            type="submit"
            form="block-form"
            disabled={create.isPending}
            aria-describedby="block-summary"
            className="h-[52px] w-full rounded-full bg-primary text-white font-bold text-[16px] inline-flex items-center justify-center hover:bg-primary-dark disabled:opacity-80"
          >
            {create.isPending ? 'Guardando…' : 'Bloquear'}
          </button>
        </div>
      }
    >
      <form id="block-form" onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-2">
          <div id="block-when" className={ui.label}>¿Cuándo?</div>
          <div role="group" aria-labelledby="block-when" className="flex flex-wrap gap-2">
            {WHEN_OPTIONS.map((o) => (
              <Chip key={o.key} selected={draft.when === o.key} onClick={() => pickWhen(o.key)} className="whitespace-nowrap shrink-0">
                {o.label}
              </Chip>
            ))}
          </div>
        </div>

        {range ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Desde">{(p) => <input {...p} type="date" min={today} className={ui.input} value={draft.from} onChange={(e) => set({ from: e.target.value })} />}</Field>
            <Field label="Hasta">{(p) => <input {...p} type="date" min={draft.from} className={ui.input} value={draft.to} onChange={(e) => set({ to: e.target.value })} />}</Field>
          </div>
        ) : (
          <label className="relative bg-primary-soft rounded-[18px] py-3 pr-2 pl-4 flex items-center gap-3 min-h-[52px]">
            <CalendarIcon size={22} className="text-primary shrink-0" />
            <span className="font-bold text-[15px] grow min-w-0">{dayLabel}</span>
            {draft.when === 'other' && (
              <>
                <span className="h-11 px-3 font-bold text-[14px] text-primary inline-flex items-center shrink-0">Cambiar</span>
                <input
                  type="date"
                  aria-label="Elegir el día"
                  min={today}
                  value={draft.date}
                  onChange={(e) => e.target.value && set({ date: e.target.value })}
                  className="absolute inset-0 opacity-0 cursor-pointer"
                />
              </>
            )}
          </label>
        )}

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3 min-h-11">
            <span className="text-[15px] font-semibold">Todo el día</span>
            <Switch on={draft.allDay} onToggle={() => set({ allDay: !draft.allDay })} label="Todo el día" />
          </div>
          {!draft.allDay && (
            <>
              <div role="group" aria-label="Atajos de horas" className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <Chip
                    key={p.key}
                    selected={draft.startTime === p.startTime && draft.endTime === p.endTime}
                    onClick={() => set({ startTime: p.startTime, endTime: p.endTime })}
                    className="whitespace-nowrap shrink-0"
                  >
                    {p.label}
                  </Chip>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-[6px]">
                  <span className={ui.label}>De</span>
                  <PillSelect variant="field" label="Desde la hora" value={draft.startTime} options={timeOptions(draft.startTime)} onChange={(v) => set({ startTime: v })} />
                </div>
                <div className="flex flex-col gap-[6px]">
                  <span className={ui.label}>Hasta</span>
                  <PillSelect variant="field" label="Hasta la hora" value={draft.endTime} options={timeOptions(draft.endTime)} onChange={(v) => set({ endTime: v })} />
                </div>
              </div>
              {range && <div className="text-[13px] text-muted">Esas horas, cada día del rango.</div>}
            </>
          )}
        </div>

        <Field label="Motivo (opcional)" help="Solo lo ves tú. Tus clientes ven esas horas como no disponibles.">
          {(p) => <input {...p} className={ui.input} value={draft.reason} maxLength={60} onChange={(e) => set({ reason: e.target.value })} placeholder="Para qué es este espacio" />}
        </Field>

        {first && (
          <div role="status" className="bg-accent-soft rounded-[18px] py-[14px] px-4 flex gap-[10px] items-start text-[14px] leading-[1.45]">
            <AlertIcon size={20} className="shrink-0" />
            <span>
              {covered.length === 1 ? (
                <>
                  <strong>Tienes 1 cita en ese horario:</strong> {first.client.name}, {range ? `${formatDayShortMonth(bogotaDate(first.start)).toLowerCase()} · ` : ''}
                  {formatInstantTime(first.start)}. Sigue en pie; si no la vas a atender, cancélala desde la agenda.
                </>
              ) : (
                <>
                  <strong>Tienes {covered.length} citas en ese horario.</strong> Siguen en pie; si no las vas a atender, cancélalas desde la agenda.
                </>
              )}
            </span>
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
