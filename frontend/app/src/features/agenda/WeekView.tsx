import { formatDuration, formatInstantTime } from '@shared/format';
import { holidayOn } from '@shared/holidays';
import { addDays, bogotaDate, weekdayOf, type ISODate } from '@shared/time';
import type { Appointment, Block, WeeklySchedule } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { blocksOn, isNewAppointment } from '../../lib/agenda';
import { LockIcon } from '../../components/ui/icons';
import { formatDayTitle, plural } from '../../lib/format';

interface Props {
  weekStart: ISODate;
  today: ISODate;
  appointments: Appointment[];
  /** «No disponible» periods, one muted line per day they touch. */
  blocks?: Block[];
  schedule: WeeklySchedule | undefined;
  now: Date;
  onPickDay: (date: ISODate) => void;
  /** Opens the appointment in the day view (with its move / cancel / attendance actions). */
  onPickAppointment: (appointment: Appointment) => void;
}

const DOT = { confirmed: 'bg-primary', new: 'bg-accent', cancelled: 'bg-line-strong' } as const;

/** Seven compact day groups in the same line-A style as the day list. */
export function WeekView({ weekStart, today, appointments, blocks = [], schedule, now, onPickDay, onPickAppointment }: Props) {
  return (
    <div className="flex flex-col gap-[10px]">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const list = appointments.filter((a) => bogotaDate(a.start) === date);
        const dayBlocks = blocksOn(date, blocks);
        const active = list.filter((a) => a.status === 'confirmed');
        const holiday = holidayOn(date);
        const closed = (schedule?.[weekdayOf(date)] ?? []).length === 0;
        const isToday = date === today;
        return (
          <div key={date} className={cx('rounded-[16px] p-3 sm:p-[14px] flex flex-col gap-2', isToday ? 'bg-primary-soft' : 'bg-surface')}>
            <button type="button" onClick={() => onPickDay(date)} className="flex items-center justify-between gap-3 text-left min-h-11 -my-1 rounded-[12px]" aria-label={`Ver el día ${formatDayTitle(date)}`}>
              <span className="font-bold text-[15px]">
                {formatDayTitle(date)}
                {isToday && <span className="text-primary"> · hoy</span>}
              </span>
              <span
                className={cx(
                  'text-[12px] font-bold py-1 px-[10px] rounded-full whitespace-nowrap',
                  holiday ? 'bg-accent-soft text-ink' : active.length ? 'bg-white text-primary' : 'bg-white text-ink-2',
                )}
              >
                {holiday ? 'Festivo' : closed && !active.length ? 'Cerrado' : active.length ? plural(active.length, 'cita', 'citas') : 'Sin citas'}
              </span>
            </button>
            {dayBlocks.map((b) => (
              <div key={b.block.id} className="flex items-center gap-3 text-[13px] text-ink-2 bg-white/60 border-2 border-line rounded-[12px] px-3 py-2 min-h-11">
                <LockIcon size={14} className="shrink-0" />
                <span className="font-bold">{b.allDay ? 'Todo el día' : `${formatInstantTime(b.start)} – ${formatInstantTime(b.end)}`}</span>
                <span className="min-w-0 truncate">No disponible</span>
              </div>
            ))}
            {list.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {list.map((a) => {
                  const kind = a.status === 'cancelled' ? 'cancelled' : isNewAppointment(a, now) ? 'new' : 'confirmed';
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => onPickAppointment(a)}
                        aria-label={`${a.client.name}, ${formatInstantTime(a.start)}, ${a.serviceName}${kind === 'new' ? ' (nueva)' : kind === 'cancelled' ? ' (cancelada)' : ''}: ver en el día`}
                        className="w-full flex items-center gap-3 text-[14px] text-left bg-white rounded-[12px] px-3 py-2 min-h-11 hover:bg-primary-soft transition-colors"
                      >
                        <span className={cx('w-2 h-2 rounded-full shrink-0', DOT[kind])} aria-hidden="true" />
                        <span className="w-[76px] shrink-0 font-bold text-ink-2 text-[13px]">{formatInstantTime(a.start)}</span>
                        <span className={cx('min-w-0 grow truncate', kind === 'cancelled' ? 'text-muted line-through' : 'font-semibold')}>{a.client.name}</span>
                        <span className="hidden sm:inline text-[13px] text-muted whitespace-nowrap">
                          {a.serviceName} · {formatDuration(a.durationMin)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
