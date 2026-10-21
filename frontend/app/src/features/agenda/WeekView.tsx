import { formatDuration, formatInstantTime } from '@shared/format';
import { holidayOn } from '@shared/holidays';
import { addDays, bogotaDate, weekdayOf, type ISODate } from '@shared/time';
import type { Appointment, WeeklySchedule } from '@shared/types';
import { cx } from '../../components/ui/cx';
import { isNewAppointment } from '../../lib/agenda';
import { formatDayTitle, plural } from '../../lib/format';

interface Props {
  weekStart: ISODate;
  today: ISODate;
  appointments: Appointment[];
  schedule: WeeklySchedule | undefined;
  now: Date;
  onPickDay: (date: ISODate) => void;
}

const DOT = { confirmed: 'bg-primary', new: 'bg-accent', cancelled: 'bg-line-strong' } as const;

/** Seven compact day groups in the same line-A style as the day list. */
export function WeekView({ weekStart, today, appointments, schedule, now, onPickDay }: Props) {
  return (
    <div className="flex flex-col gap-[10px]">
      {Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i);
        const list = appointments.filter((a) => bogotaDate(a.start) === date);
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
            {list.length > 0 && (
              <ul className="m-0 p-0 list-none flex flex-col gap-1">
                {list.map((a) => {
                  const kind = a.status === 'cancelled' ? 'cancelled' : isNewAppointment(a, now) ? 'new' : 'confirmed';
                  return (
                    <li key={a.id} className="flex items-center gap-3 text-[14px] bg-white rounded-[12px] px-3 py-2 min-h-11">
                      <span className={cx('w-2 h-2 rounded-full shrink-0', DOT[kind])} aria-hidden="true" />
                      <span className="w-[76px] shrink-0 font-bold text-ink-2 text-[13px]">{formatInstantTime(a.start)}</span>
                      <span className={cx('min-w-0 grow truncate', kind === 'cancelled' ? 'text-muted line-through' : 'font-semibold')}>{a.client.name}</span>
                      <span className="hidden sm:inline text-[13px] text-muted whitespace-nowrap">
                        {a.serviceName} · {formatDuration(a.durationMin)}
                      </span>
                      {kind === 'new' && <span className="sr-only">(nueva)</span>}
                      {kind === 'cancelled' && <span className="sr-only">(cancelada)</span>}
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
