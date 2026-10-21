import { useState } from 'preact/hooks';
import type { AvailabilityResponse } from '@shared/api';
import type { DayAvailability } from '@shared/availability';
import { capitalize, DAY_SHORT, formatDayLong, formatDayShort, formatInstantTime } from '@shared/format';
import { jsWeekday } from '@shared/time';
import { ChevronLeft, ChevronRight } from '../components/icons';
import { DayPill, Notice, SkeletonPills, SkeletonSlots, SlotButton } from '../components/ui';
import { chunk, DAYS_PER_WEEK, isDayBookable, monthLabel, splitSlots } from '../lib/slots';
import { StepTitle } from './FlowChrome';

export type AvailabilityState =
  | { status: 'loading' }
  | { status: 'ready'; data: AvailabilityResponse }
  | { status: 'error'; message: string };

interface Props {
  availability: AvailabilityState | undefined;
  day: string | null;
  start: string | null;
  notice: string | null;
  onPickDay: (date: string) => void;
  onPickSlot: (start: string) => void;
  onRetry: () => void;
  titleRef: preact.Ref<HTMLHeadingElement>;
}

const NAV_BUTTON =
  'w-11 h-11 rounded-full border-0 bg-surface text-ink flex items-center justify-center hover:bg-line disabled:opacity-40 disabled:cursor-default disabled:hover:bg-surface';

function dayLabel(day: DayAvailability): string {
  const base = capitalize(formatDayLong(day.date));
  if (day.closed === 'holiday') return `${base}, festivo`;
  if (!isDayBookable(day)) return `${base}, sin horas libres`;
  return base;
}

function SlotGroup({ title, slots, start, onPickSlot }: { title: string; slots: string[]; start: string | null; onPickSlot: (s: string) => void }) {
  if (slots.length === 0) return null;
  return (
    <>
      <div class="text-[14px] font-semibold text-muted">{title}</div>
      <div class="grid grid-cols-3 gap-2">
        {slots.map((slot) => (
          <SlotButton key={slot} label={formatInstantTime(slot)} selected={slot === start} onPick={() => onPickSlot(slot)} />
        ))}
      </div>
    </>
  );
}

export function StepWhen({ availability, day, start, notice, onPickDay, onPickSlot, onRetry, titleRef }: Props) {
  const days = availability?.status === 'ready' ? availability.data.days : [];
  const weeks = chunk(days, DAYS_PER_WEEK);
  const selectedIndex = day ? days.findIndex((d) => d.date === day) : -1;
  const [week, setWeek] = useState(() => (selectedIndex >= 0 ? Math.floor(selectedIndex / DAYS_PER_WEEK) : 0));
  const current = weeks[Math.min(week, Math.max(0, weeks.length - 1))] ?? [];
  const selectedDay = selectedIndex >= 0 ? days[selectedIndex] : null;
  const holidays = current.filter((d) => d.holidayName);
  const nothingFree = availability?.status === 'ready' && days.length > 0 && !days.some(isDayBookable);
  const loading = !availability || availability.status === 'loading';

  return (
    <section class="flex flex-col gap-3.5">
      <StepTitle titleRef={titleRef}>¿Cuándo te sirve?</StepTitle>
      {notice && <Notice>{notice}</Notice>}
      <div class="flex justify-between items-center gap-2">
        <span class="text-[14px] font-semibold text-muted">{monthLabel(current.map((d) => d.date))}</span>
        <div class="flex gap-1">
          <button type="button" aria-label="Semana anterior" class={NAV_BUTTON} disabled={week <= 0} onClick={() => setWeek(week - 1)}>
            <ChevronLeft size={16} strokeWidth={2.4} />
          </button>
          <button
            type="button"
            aria-label="Semana siguiente"
            class={NAV_BUTTON}
            disabled={week >= weeks.length - 1}
            onClick={() => setWeek(week + 1)}
          >
            <ChevronRight size={16} strokeWidth={2.4} />
          </button>
        </div>
      </div>

      {availability?.status === 'error' ? (
        <div class="flex flex-col gap-3">
          <Notice>{availability.message}</Notice>
          <button type="button" onClick={onRetry} class="h-11 rounded-full border-2 border-line bg-white font-bold text-[15px] text-ink">
            Reintentar
          </button>
        </div>
      ) : loading ? (
        <>
          <SkeletonPills count={7} columns={7} />
          <span class="sr-only" role="status">Cargando horas libres…</span>
        </>
      ) : (
        <div class="grid grid-cols-7 gap-1.5">
          {current.map((d) => (
            <DayPill
              key={d.date}
              dow={DAY_SHORT[jsWeekday(d.date)]}
              num={String(Number(d.date.slice(8)))}
              label={dayLabel(d)}
              selected={d.date === day}
              disabled={!isDayBookable(d)}
              onPick={() => onPickDay(d.date)}
            />
          ))}
        </div>
      )}

      {holidays.length > 0 && (
        <div class="text-[13px] text-muted -mt-1">
          {holidays.map((d) => `${formatDayShort(d.date)} es festivo (${d.holidayName}).`).join(' ')}
        </div>
      )}

      {loading && day ? (
        <SkeletonSlots />
      ) : nothingFree ? (
        <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
          No quedan horas libres en los próximos días. Vuelve a intentarlo más adelante.
        </div>
      ) : selectedDay ? (
        selectedDay.slots.length > 0 ? (
          <div class="flex flex-col gap-2.5 fade-in" key={selectedDay.date}>
            <SlotGroup title="Mañana" slots={splitSlots(selectedDay.slots).morning} start={start} onPickSlot={onPickSlot} />
            <SlotGroup title="Tarde" slots={splitSlots(selectedDay.slots).afternoon} start={start} onPickSlot={onPickSlot} />
          </div>
        ) : (
          <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
            Ya no quedan horas libres este día. Elige otro, por favor.
          </div>
        )
      ) : (
        <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Elige un día para ver las horas libres.</div>
      )}
    </section>
  );
}
