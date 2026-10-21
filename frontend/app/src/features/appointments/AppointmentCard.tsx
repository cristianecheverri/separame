import { formatDuration } from '@shared/format';
import type { Appointment } from '@shared/types';
import type { DayRow } from '../../lib/agenda';
import { cx } from '../../components/ui/cx';
import { CloseIcon, MoveIcon } from '../../components/ui/icons';
import { ui } from '../../components/ui/styles';

interface Props {
  row: DayRow;
  readOnly?: boolean;
  onMove?: (appointment: Appointment) => void;
  onCancel?: (appointment: Appointment) => void;
  onFree?: (row: DayRow) => void;
  /** false hides move/cancel (past appointments). */
  actions?: boolean;
}

const CARD = 'grow min-w-0 flex gap-3 items-center rounded-[16px] min-h-16 box-border';

const KIND = {
  confirmed: { card: 'bg-primary-soft', name: 'font-bold', badge: 'bg-primary text-white', label: 'Confirmada' },
  new: { card: 'bg-accent-soft', name: 'font-bold', badge: 'bg-accent text-ink', label: 'Nueva' },
  free: { card: 'bg-white border-2 border-dashed border-line-strong', name: 'font-semibold text-muted', badge: 'bg-surface text-ink-2', label: 'Libre' },
  cancelled: { card: 'bg-surface', name: 'font-semibold text-muted line-through', badge: 'bg-white text-ink-2', label: 'Cancelada' },
} as const;

function detailOf(row: DayRow): string {
  if (row.kind === 'free') return `${row.freeMinutes} min disponibles`;
  const a = row.appointment!;
  if (row.kind === 'cancelled') return `${a.serviceName} · ${a.cancelledBy === 'client' ? 'canceló desde el correo' : 'cancelada'}`;
  return `${a.serviceName} · ${formatDuration(a.durationMin)}`;
}

/** One row of the agenda (pro-agenda-day / pro-expired-read-only), stacked on phones. */
export function AppointmentCard({ row, readOnly, onMove, onCancel, onFree, actions = true }: Props) {
  const appointment = row.appointment;
  const active = row.kind === 'confirmed' || row.kind === 'new';
  const lockedView = readOnly && row.kind !== 'cancelled';
  const kind = KIND[row.kind];
  const badgeLabel = lockedView ? (appointment?.reminderSentAt ? 'Recordatorio enviado' : 'Confirmada') : kind.label;
  const badgeClass = lockedView ? 'bg-white text-primary' : kind.badge;
  const showActions = actions && active && !readOnly && !!appointment && !appointment.id.startsWith('temp-');
  const name = row.kind === 'free' ? 'Espacio libre' : appointment!.client.name;

  const badge = <span className={cx(ui.badge, badgeClass)}>{badgeLabel}</span>;
  const body = (
    <>
      <div className="flex flex-col gap-[3px] grow min-w-0">
        <div className={cx('text-[15px] [overflow-wrap:anywhere]', lockedView ? 'font-bold' : kind.name)}>{name}</div>
        <div className="text-[13px] text-muted">{detailOf(row)}</div>
        <div className="sm:hidden pt-1">{badge}</div>
      </div>
      <span className="hidden sm:inline-flex">{badge}</span>
    </>
  );

  return (
    <div className="flex flex-col gap-[6px] sm:flex-row sm:gap-4 sm:items-stretch">
      <div className="sm:w-[84px] shrink-0 sm:pt-[14px] font-bold text-[13px] sm:text-[14px] text-ink-2">{row.time}</div>
      {row.kind === 'free' && onFree && !readOnly ? (
        <button
          type="button"
          onClick={() => onFree(row)}
          aria-label={`Espacio libre a las ${row.time}: agendar una cita`}
          className={cx(CARD, kind.card, 'py-[10px] pr-[10px] pl-4 text-left hover:border-primary transition-colors')}
        >
          {body}
        </button>
      ) : (
        <div className={cx(CARD, lockedView ? 'bg-primary-soft py-[10px] px-4' : cx(kind.card, 'py-[10px] pr-[10px] pl-4'))}>
          {body}
          {showActions && (
            <div className="flex gap-1 shrink-0">
              <button type="button" aria-label={`Mover cita de ${name}`} className={ui.iconBtn} onClick={() => onMove?.(appointment)}>
                <MoveIcon />
              </button>
              <button type="button" aria-label={`Cancelar cita de ${name}`} className={ui.iconBtn} onClick={() => onCancel?.(appointment)}>
                <CloseIcon />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
