import { useState } from 'react';
import { formatDuration } from '@shared/format';
import type { Appointment, AppointmentOutcome } from '@shared/types';
import type { DayRow } from '../../lib/agenda';
import { cx } from '../../components/ui/cx';
import { CheckIcon, ClockIcon, CloseIcon, MoveIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';

interface Props {
  row: DayRow;
  now: Date;
  readOnly?: boolean;
  onMove?: (appointment: Appointment) => void;
  onCancel?: (appointment: Appointment) => void;
  onFree?: (row: DayRow) => void;
  onOutcome?: (appointment: Appointment, outcome: AppointmentOutcome | null) => void;
  /** false hides move/cancel (lists of past appointments). */
  actions?: boolean;
  /** Hide the time column (e.g. when the date+time is in the detail line). */
  timeLabel?: React.ReactNode;
  /** 'service' leads with the service (client history), 'client' with the client's name. */
  title?: 'client' | 'service';
  /** Briefly outlined (picked from the week view). */
  highlighted?: boolean;
  /** Team plan, «Todos»: whose appointment it is (small tag in that professional's color). */
  member?: { label: string; bg: string; fg: string };
}

const CARD = 'grow min-w-0 flex gap-2 items-start rounded-[16px] min-h-16 box-border';

/** The status pill shows only when it adds something (proposal MP-04): no pill for a plain confirmed appointment. */
const KIND = {
  confirmed: { card: 'bg-primary-soft', name: 'font-bold', badge: null, label: null },
  new: { card: 'bg-accent-soft', name: 'font-bold', badge: 'bg-accent text-ink', label: 'Nueva' },
  free: { card: 'bg-white border-2 border-dashed border-line-strong', name: 'font-semibold text-muted', badge: 'bg-surface text-ink-2', label: 'Libre' },
  cancelled: { card: 'bg-surface', name: 'font-semibold text-muted line-through', badge: 'bg-white text-ink-2', label: 'Cancelada' },
} as const;

function detailOf(row: DayRow, title: 'client' | 'service'): string {
  if (row.kind === 'free') return `${row.freeMinutes} min disponibles`;
  const a = row.appointment!;
  const lead = title === 'service' ? formatDuration(a.durationMin) : a.serviceName;
  if (row.kind === 'cancelled') return `${lead} · ${a.cancelledBy === 'client' ? 'canceló desde el correo' : 'cancelada'}`;
  return title === 'service' ? lead : `${lead} · ${formatDuration(a.durationMin)}`;
}

const pill = 'hit-44 h-10 px-3 rounded-full text-[13px] font-bold inline-flex items-center justify-center gap-[6px] whitespace-nowrap transition-colors disabled:opacity-60';

/** One row of the agenda (pro-agenda-day / pro-expired-read-only): one status line, actions always top-right. */
export function AppointmentCard({ row, now, readOnly, onMove, onCancel, onFree, onOutcome, actions = true, timeLabel, title = 'client', highlighted, member }: Props) {
  const [editing, setEditing] = useState(false);
  const appointment = row.appointment;
  const active = row.kind === 'confirmed' || row.kind === 'new';
  const lockedView = readOnly && row.kind !== 'cancelled';
  const started = !!appointment && new Date(appointment.start).getTime() <= now.getTime();
  const persisted = !!appointment && !appointment.id.startsWith('temp-');
  const kind = KIND[row.kind];
  const name = row.kind === 'free' ? 'Espacio libre' : title === 'service' ? appointment!.serviceName : appointment!.client.name;

  const outcome = active && started ? appointment!.outcome : undefined;
  const canMark = active && started && !readOnly && !!onOutcome && persisted;
  const showOutcomeButtons = canMark && (!outcome || editing);
  const showMoveCancel = actions && active && !started && !readOnly && persisted;

  let badgeLabel: string | null = kind.label;
  let badgeClass: string | null = kind.badge;
  if (lockedView) {
    badgeLabel = appointment?.reminderSentAt ? 'Recordatorio enviado' : 'Confirmada';
    badgeClass = 'bg-white text-primary';
  } else if (outcome && !editing) {
    badgeLabel = outcome === 'attended' ? 'Asistió' : 'No asistió';
    badgeClass = outcome === 'attended' ? 'bg-white text-primary' : 'bg-warn-soft text-warn-ink';
  }
  /** Did the client answer the "¿Confirmas tu asistencia?" email? None when nobody could be asked (no email). */
  const attendance = active && !started && appointment ? (appointment.clientConfirmation === 'confirmed' ? 'confirmed' : appointment.client.email ? 'no_answer' : null) : null;
  const showChange = !!outcome && !editing && canMark;

  const mark = (value: AppointmentOutcome | null) => {
    setEditing(false);
    onOutcome?.(appointment!, value);
  };

  const hasStatus = !!badgeLabel || !!attendance || !!member;
  const body = (
    <div className="flex flex-col gap-1 grow basis-0 min-w-0">
      <div className={cx('text-[15px] [overflow-wrap:anywhere]', lockedView ? 'font-bold' : kind.name)}>{name}</div>
      <div className="text-[13px] text-muted">{detailOf(row, title)}</div>
      {hasStatus && (
        <div className="flex flex-wrap items-center gap-2 pt-[2px] min-h-6">
          {member && (
            <span className={cx(ui.badge, 'py-1')} style={{ background: member.bg, color: member.fg }}>
              <span className="sr-only">Con </span>
              {member.label}
            </span>
          )}
          {badgeLabel && <span className={cx(ui.badge, 'py-1', badgeClass)}>{badgeLabel}</span>}
          {attendance === 'confirmed' && (
            <span className="inline-flex items-center gap-[5px] text-[13px] font-bold text-primary">
              <CheckIcon size={15} strokeWidth={2.6} /> Confirmó asistencia
            </span>
          )}
          {attendance === 'no_answer' && (
            <span className="inline-flex items-center gap-[5px] text-[13px] font-semibold text-muted">
              <ClockIcon size={15} strokeWidth={2.2} /> Sin respuesta
            </span>
          )}
        </div>
      )}
    </div>
  );
  const hasActions = showMoveCancel || showOutcomeButtons || showChange;

  return (
    <div id={appointment ? `appointment-${appointment.id}` : undefined} className="flex flex-col gap-[6px] sm:flex-row sm:gap-4 sm:items-stretch scroll-mt-20">
      {timeLabel !== '' && <div className="sm:w-[84px] shrink-0 sm:pt-[14px] font-bold text-[13px] sm:text-[14px] text-ink-2">{timeLabel ?? row.time}</div>}
      {row.kind === 'free' && onFree && !readOnly ? (
        <button
          type="button"
          onClick={() => onFree(row)}
          aria-label={`Espacio libre a las ${row.time}: agendar una cita`}
          className={cx(CARD, kind.card, 'py-3 px-4 text-left hover:border-primary transition-colors')}
        >
          {body}
        </button>
      ) : (
        <div className={cx(CARD, lockedView ? 'bg-primary-soft' : kind.card, 'py-3 pl-4', hasActions ? 'pr-[6px]' : 'pr-4', highlighted && 'ring-2 ring-primary ring-offset-2 transition-shadow')}>
          {body}
          {hasActions && (
            <div className="flex flex-col items-end gap-[6px] shrink-0">
              {showMoveCancel && (
                <div className="flex gap-[2px]">
                  <button type="button" aria-label={`Mover cita de ${name}`} className={ui.iconBtn} onClick={() => onMove?.(appointment!)}>
                    <MoveIcon />
                  </button>
                  <button type="button" aria-label={`Cancelar cita de ${name}`} className={ui.iconBtn} onClick={() => onCancel?.(appointment!)}>
                    <CloseIcon />
                  </button>
                </div>
              )}
              {showOutcomeButtons && (
                <div className="flex flex-col sm:flex-row gap-[6px] sm:gap-2" role="group" aria-label={`Asistencia de ${name}`}>
                  <button type="button" className={cx(pill, 'bg-primary text-white hover:bg-primary-dark')} onClick={() => mark('attended')}>
                    <CheckIcon size={13} /> Asistió
                  </button>
                  <button type="button" className={cx(pill, 'bg-white text-ink-2 border-2 border-line-strong hover:border-ink-2')} onClick={() => mark('no_show')}>
                    <CloseIcon size={13} strokeWidth={3} /> No asistió
                  </button>
                </div>
              )}
              {showChange && (
                <button type="button" className="min-h-11 px-[10px] text-[13px] font-bold text-primary underline underline-offset-2" onClick={() => setEditing(true)} aria-label={`Cambiar asistencia de ${name}`}>
                  Cambiar
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
