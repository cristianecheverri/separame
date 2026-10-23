import { Fragment } from 'preact';
import { useState } from 'preact/hooks';
import type { AvailabilityResponse } from '@shared/api';
import type { DayAvailability } from '@shared/availability';
import { capitalize, DAY_SHORT, formatDayLong, formatDayShort, formatInstantTime } from '@shared/format';
import { jsWeekday } from '@shared/time';
import { Bell, ChevronRight } from '../components/icons';
import { DayPill, FullDot, MemberAvatar, Notice, SkeletonPills, SkeletonSlots, SlotGroup, WeekNav } from '../components/ui';
import { chunk, DAYS_PER_WEEK, isDayBookable, monthLabel, splitSlots, weekOf } from '../lib/slots';
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
  onWaitlist: () => void;
  titleRef: preact.Ref<HTMLHeadingElement>;
  titleAs: 'h1' | 'h2';
  /** «Cualquiera disponible»: who takes the picked hour, shown under its grid. */
  assignee?: Assignee | null;
}

export interface Assignee {
  name: string;
  initials: string;
  /** Position in the team (avatar color). */
  index: number;
}

/** «Te atiende: Dra. Sara Gómez (libre a esa hora)» under the grid that holds the picked hour. */
function AssigneeNote({ assignee }: { assignee: Assignee }) {
  return (
    <div role="status" class="flex gap-2 items-center text-[14px] text-ink-2 min-h-6 -mt-1 fade-in">
      <MemberAvatar initials={assignee.initials} index={assignee.index} size={24} />
      <span>
        Te atiende: <strong class="font-bold text-ink">{assignee.name}</strong> <span class="text-[13px] text-muted">(libre a esa hora)</span>
      </span>
    </div>
  );
}

/** Screen-reader label: a closed day ("no hay atención") must not sound like a full one ("sin horas libres"). */
function dayLabel(day: DayAvailability): string {
  const base = capitalize(formatDayLong(day.date));
  if (day.closed === 'holiday') return `${base}, festivo`;
  if (day.closed !== null) return `${base}, no hay atención`;
  if (!isDayBookable(day)) return `${base}, lleno`;
  return base;
}

const isFull = (day: DayAvailability) => day.closed === null && day.slots.length === 0;

/** "Lleno = te avisamos si se libera" under the day pills when the week has a full day. */
function FullLegend() {
  return (
    <div class="flex gap-2 items-center text-[13px] text-ink-2 -mt-1">
      <span aria-hidden="true" class="relative w-[18px] h-[18px] rounded-md border-2 border-dashed border-radio shrink-0">
        <FullDot class="top-0.5 right-0.5 w-[5px] h-[5px]" />
      </span>
      <span>
        <strong class="font-bold text-ink">Lleno</strong> = te avisamos si se libera
      </span>
    </div>
  );
}

/** Entry point to the waitlist when the client can't find a free hour. */
export function WaitlistCard({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      class="flex items-center gap-3 w-full text-left p-4 rounded-[20px] border-2 border-accent-soft bg-accent-soft text-ink hover:border-accent transition-colors fade-in"
    >
      <span class="w-11 h-11 rounded-full bg-white flex items-center justify-center shrink-0" aria-hidden="true">
        <Bell size={20} />
      </span>
      <span class="flex flex-col gap-0.5 grow min-w-0">
        <span class="font-bold text-[16px]">¿No encuentras hora?</span>
        <span class="text-[14px] text-ink-2">Te avisamos si se libera un cupo</span>
      </span>
      <ChevronRight size={18} strokeWidth={2.4} class="shrink-0" />
    </button>
  );
}

export function StepWhen({ availability, day, start, notice, onPickDay, onPickSlot, onRetry, onWaitlist, titleRef, titleAs, assignee = null }: Props) {
  const days = availability?.status === 'ready' ? availability.data.days : [];
  const weeks = chunk(days, DAYS_PER_WEEK);
  // Only open days can be selected: a closed one (deep link, stale draft) never shows the waitlist.
  const selectedIndex = day ? days.findIndex((d) => d.date === day && d.closed === null) : -1;
  const [week, setWeek] = useState(() => weekOf(days, selectedIndex >= 0 ? day : null));
  const current = weeks[Math.min(week, Math.max(0, weeks.length - 1))] ?? [];
  const selectedDay = selectedIndex >= 0 ? days[selectedIndex] : null;
  const holidays = current.filter((d) => d.holidayName);
  const nothingFree = availability?.status === 'ready' && days.length > 0 && !days.some(isDayBookable);
  const canWait = days.some((d) => d.closed === null);
  const loading = !availability || availability.status === 'loading';

  return (
    <section class="flex flex-col gap-3.5">
      <StepTitle titleRef={titleRef} as={titleAs}>¿Cuándo te sirve?</StepTitle>
      {notice && <Notice>{notice}</Notice>}
      <WeekNav label={monthLabel(current.map((d) => d.date))} week={week} weeks={weeks.length} onWeek={setWeek} />

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
              disabled={d.closed !== null}
              full={isFull(d)}
              onPick={() => onPickDay(d.date)}
            />
          ))}
        </div>
      )}

      {!loading && current.some(isFull) && <FullLegend />}

      {holidays.length > 0 && (
        <div class="text-[13px] text-muted -mt-1">
          {holidays.map((d) => `${formatDayShort(d.date)} es festivo (${d.holidayName}).`).join(' ')}
        </div>
      )}

      {loading ? (
        <SkeletonSlots />
      ) : nothingFree && !(selectedDay && selectedDay.slots.length > 0) ? (
        <>
          <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
            No quedan horas libres en los próximos días.
          </div>
          {canWait && <WaitlistCard onClick={onWaitlist} />}
        </>
      ) : selectedDay ? (
        selectedDay.slots.length > 0 ? (
          <div class="flex flex-col gap-3.5 fade-in" key={selectedDay.date}>
            <div class="mt-1 text-[15px] font-bold">{capitalize(formatDayLong(selectedDay.date))}</div>
            {(['morning', 'afternoon'] as const).map((part) => {
              const slots = splitSlots(selectedDay.slots)[part];
              return (
                <Fragment key={part}>
                  <SlotGroup title={part === 'morning' ? 'Mañana' : 'Tarde'} slots={slots} start={start} onPickSlot={onPickSlot} format={formatInstantTime} />
                  {assignee && start && slots.includes(start) && <AssigneeNote assignee={assignee} />}
                </Fragment>
              );
            })}
          </div>
        ) : (
          <>
            <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center leading-[1.45]">
              Ya no quedan horas libres este día.
            </div>
            <WaitlistCard onClick={onWaitlist} />
          </>
        )
      ) : (
        <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">Elige un día para ver las horas libres.</div>
      )}
    </section>
  );
}
