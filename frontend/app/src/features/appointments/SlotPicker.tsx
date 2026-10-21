import { useEffect, useMemo, useState } from 'react';
import { DAY_SHORT, formatInstantTime } from '@shared/format';
import { bogotaTime, jsWeekday, todayBogota, type ISODate } from '@shared/time';
import { cx } from '../../components/ui/cx';
import { ChevronLeftIcon, ChevronRightIcon } from '../../components/ui/icons';
import { Skeleton } from '../../components/ui/Skeleton';
import { now } from '../../lib/clock';
import { formatDateNoYearRange } from './slotFormat';
import { useSlots } from '../../lib/queries';

const WEEKS = 4;
/** Days of free times the picker loads (other views reuse the same query). */
export const SLOT_PICKER_DAYS = WEEKS * 7;

interface Props {
  serviceId: string | null;
  value: string | null;
  onChange: (start: string | null) => void;
  initialDate?: ISODate;
  /** Instant to hide (the appointment being moved). */
  exclude?: string;
}

/** Day grid (7 per page) + "Mañana" / "Tarde" slot chips, from GET /me/slots. */
export function SlotPicker({ serviceId, value, onChange, initialDate, exclude }: Props) {
  const today = todayBogota(now());
  const slots = useSlots(serviceId, today, SLOT_PICKER_DAYS);
  const [page, setPage] = useState(() => (initialDate ? Math.min(WEEKS - 1, Math.max(0, Math.floor((Date.parse(initialDate) - Date.parse(today)) / (7 * 86_400_000)))) : 0));
  const [picked, setPicked] = useState<ISODate | null>(initialDate ?? null);

  const days = useMemo(() => slots.data?.days ?? [], [slots.data]);
  const firstOpen = days.find((d) => d.slots.length > 0)?.date ?? null;
  const day = picked && days.some((d) => d.date === picked) ? picked : firstOpen;
  const pageDays = days.slice(page * 7, page * 7 + 7);
  const current = days.find((d) => d.date === day);
  const available = (current?.slots ?? []).filter((s) => s !== exclude);
  const morning = available.filter((s) => bogotaTime(s) < '12:00');
  const afternoon = available.filter((s) => bogotaTime(s) >= '12:00');

  // A preselected time (e.g. the agenda gap that was tapped) that this service can't use is dropped.
  const loaded = !!slots.data;
  useEffect(() => {
    if (!loaded || !value) return;
    if (value === exclude || !days.some((d) => d.slots.includes(value))) onChange(null);
  }, [loaded, days, value, exclude, onChange]);

  if (!serviceId) {
    return <div className="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Elige un servicio para ver las horas libres.</div>;
  }
  if (slots.isPending) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true" aria-label="Cargando horarios">
        <Skeleton className="h-16 w-full rounded-[14px]" />
        <Skeleton className="h-24 w-full rounded-[14px]" />
      </div>
    );
  }
  if (slots.isError) return <div className="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">No pudimos cargar los horarios. Cierra e inténtalo de nuevo.</div>;

  const slotChip = (start: string) => {
    const selected = value === start;
    return (
      <button
        key={start}
        type="button"
        aria-pressed={selected}
        onClick={() => onChange(selected ? null : start)}
        className={cx('rounded-full font-semibold text-[15px] min-h-[46px] border-2 text-ink transition-colors', selected ? 'bg-accent border-accent' : 'bg-white border-line hover:border-line-strong')}
      >
        {formatInstantTime(start)}
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[14px] font-semibold">{pageDays.length ? formatDateNoYearRange(pageDays[0].date, pageDays[pageDays.length - 1].date) : ''}</div>
        <div className="flex gap-2">
          <button type="button" aria-label="Semana anterior" disabled={page === 0} onClick={() => setPage(page - 1)} className="w-11 h-11 rounded-full bg-surface text-ink flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronLeftIcon size={16} />
          </button>
          <button type="button" aria-label="Semana siguiente" disabled={page >= WEEKS - 1} onClick={() => setPage(page + 1)} className="w-11 h-11 rounded-full bg-surface text-ink flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed">
            <ChevronRightIcon size={16} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-[6px]">
        {pageDays.map((d) => {
          const off = d.slots.length === 0;
          const selected = d.date === day;
          return (
            <button
              key={d.date}
              type="button"
              disabled={off}
              aria-pressed={selected}
              aria-label={`${DAY_SHORT[jsWeekday(d.date)]} ${Number(d.date.slice(8))}${off ? ', sin horas libres' : ''}`}
              onClick={() => {
                setPicked(d.date);
                onChange(null);
              }}
              className={cx(
                'flex flex-col items-center gap-[2px] py-[10px] rounded-[14px] min-h-16 border-2',
                off ? 'bg-surface border-surface text-faint cursor-default' : selected ? 'bg-primary border-primary text-white' : 'bg-white border-line text-ink hover:border-line-strong',
              )}
            >
              <span className="text-[12px] font-semibold">{DAY_SHORT[jsWeekday(d.date)]}</span>
              <span className="text-[18px] font-bold">{Number(d.date.slice(8))}</span>
            </button>
          );
        })}
      </div>
      {current && (current.holidayName && current.slots.length === 0 ? (
        <div className="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Festivo: {current.holidayName}.</div>
      ) : available.length === 0 ? (
        <div className="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">No quedan horas libres este día.</div>
      ) : (
        <div className="flex flex-col gap-[10px]">
          {morning.length > 0 && (
            <>
              <div className="text-[14px] font-semibold text-muted">Mañana</div>
              <div className="grid grid-cols-3 gap-2">{morning.map(slotChip)}</div>
            </>
          )}
          {afternoon.length > 0 && (
            <>
              <div className="text-[14px] font-semibold text-muted">Tarde</div>
              <div className="grid grid-cols-3 gap-2">{afternoon.map(slotChip)}</div>
            </>
          )}
        </div>
      ))}
      {!current && <div className="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">No hay horas libres en las próximas semanas.</div>}
    </div>
  );
}

