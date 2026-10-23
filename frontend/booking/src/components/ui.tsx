/** Building blocks shared by the booking flow, the result screens and the manage page. */
import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { revealElement } from '../lib/scroll';
import { Alert as AlertIcon, ChevronLeft, ChevronRight } from './icons';

export function Frame({ children, label }: { children: ComponentChildren; label?: string }) {
  return (
    <div class="app-stage">
      <div class="app-frame" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** "sepárame." — the dot is deep yellow on white, bright yellow on the green band. */
export function Wordmark({ size = 20, onGreen = false }: { size?: 16 | 20; onGreen?: boolean }) {
  return (
    <div
      class={`font-display font-extrabold leading-[normal] ${size === 16 ? 'text-[16px]' : 'text-[20px] tracking-[-0.5px]'} ${onGreen ? 'text-white' : 'text-primary'}`}
    >
      sepárame<span class={onGreen ? 'text-accent' : 'text-accent-deep'}>.</span>
    </div>
  );
}

const AVATAR_SIZES = {
  36: 'w-9 h-9 text-[14px]',
  40: 'w-10 h-10 text-[14px]',
  44: 'w-11 h-11 text-[16px]',
  64: 'w-16 h-16 text-[24px]',
} as const;

export function Avatar({ initials, size = 44, tone = 'green', class: className = '' }: {
  initials: string;
  size?: keyof typeof AVATAR_SIZES;
  tone?: 'green' | 'yellow';
  class?: string;
}) {
  const colors = tone === 'yellow' ? 'bg-accent text-ink' : 'bg-primary text-white';
  return (
    <div
      class={`${AVATAR_SIZES[size]} ${colors} rounded-full flex items-center justify-center shrink-0 font-display font-extrabold ${className}`}
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

/** Team plan: each professional keeps a color by position (same idea as the panel), cycling after the third. */
const MEMBER_TONES = ['bg-primary text-white', 'bg-accent text-ink', 'bg-ink text-white'] as const;

const MEMBER_AVATAR_SIZES = {
  24: 'w-6 h-6 text-[10px]',
  32: 'w-8 h-8 text-[12px] border-2 border-white',
  44: 'w-11 h-11 text-[15px]',
} as const;

/** Initials of a team member in their color: «¿Con quién?», the team band and «Te atiende». */
export function MemberAvatar({ initials, index, size = 44, class: className = '' }: {
  initials: string;
  /** Position in the team (owner = 0): picks the color. */
  index: number;
  size?: keyof typeof MEMBER_AVATAR_SIZES;
  class?: string;
}) {
  const tone = MEMBER_TONES[((index % MEMBER_TONES.length) + MEMBER_TONES.length) % MEMBER_TONES.length];
  return (
    <span
      class={`${MEMBER_AVATAR_SIZES[size]} ${tone} rounded-full flex items-center justify-center shrink-0 font-bold box-border ${className}`}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}

/** Page-like screens: the whole frame content scrolls and bottom links sit at the end. */
export function PageScroll({ children, class: className = '' }: { children: ComponentChildren; class?: string }) {
  return (
    <main class="scroll-area">
      <div class={`min-h-full flex flex-col safe-top safe-bottom ${className}`}>{children}</div>
    </main>
  );
}

export function Notice({ children, tone = 'warn' }: { children: ComponentChildren; tone?: 'warn' | 'info' }) {
  const colors = tone === 'warn' ? 'bg-warn-soft text-warn-ink' : 'bg-accent-soft text-ink';
  return (
    <div role="alert" class={`${colors} rounded-[18px] px-4 py-3.5 flex gap-2.5 items-start text-[14px] leading-[1.45] fade-in`}>
      <AlertIcon size={20} class="shrink-0" />
      <span>{children}</span>
    </div>
  );
}

/**
 * A submit error that may appear below the fold (short phones): it scrolls
 * itself into view; `role="alert"` (Notice) announces it.
 */
export function RevealedNotice({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => revealElement(ref.current), [message]);
  return (
    <div ref={ref} class="scroll-my-4">
      <Notice>{message}</Notice>
    </div>
  );
}

/** 44 px tall hit area around small text links; negative margins keep the visual layout unchanged. */
const LEGAL_LINK = 'inline-flex items-center min-h-11 -my-3.5 px-1.5 -mx-1.5 text-muted underline-offset-2 hover:text-ink-2';

/** Discreet links to the legal pages (Ley 1581). */
export function LegalLinks({ class: className = '' }: { class?: string }) {
  return (
    <nav aria-label="Legal" class={`flex justify-center items-center gap-1.5 text-[12px] text-muted ${className}`}>
      <a href="/privacy" class={LEGAL_LINK}>Privacidad</a>
      <span aria-hidden="true">·</span>
      <a href="/terms" class={LEGAL_LINK}>Términos</a>
    </nav>
  );
}

export function MadeWith() {
  return (
    <div class="mt-auto flex flex-col gap-2">
      <div class="text-center text-[13px] text-muted">
        Agenda hecha con <span class="font-display font-extrabold text-primary">sepárame.</span>
      </div>
      <LegalLinks />
    </div>
  );
}

const DAY_BASE = 'relative flex flex-col items-center justify-center gap-0.5 px-0 rounded-[14px] border-2 min-w-0 transition-colors';

export interface DayPillProps {
  dow: string;
  num: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  /** Open but fully booked: white with a dashed border and a warn dot, still selectable (waitlist). */
  full?: boolean;
  /** Manage page: slightly shorter pills. */
  compact?: boolean;
  onPick: () => void;
}

export function DayPill({ dow, num, label, selected, disabled, full = false, compact = false, onPick }: DayPillProps) {
  const tone = disabled
    ? 'bg-surface border-surface text-faint cursor-default'
    : selected
      ? 'bg-primary border-primary text-white'
      : full
        ? 'bg-white border-dashed border-radio text-ink-2 hover:border-line-strong'
        : 'bg-white border-line text-ink hover:border-line-strong';
  return (
    <button
      type="button"
      class={`${DAY_BASE} ${compact ? 'py-2 min-h-[58px]' : 'py-2.5 min-h-16'} ${tone}`}
      disabled={disabled}
      aria-pressed={selected}
      aria-label={label}
      onClick={onPick}
    >
      {full && !selected && !disabled && <FullDot class="top-1.5 right-1.5 w-[7px] h-[7px]" />}
      <span class="text-[12px] font-semibold">{dow}</span>
      <span class={`${compact ? 'text-[17px]' : 'text-[18px]'} font-bold`}>{num}</span>
    </button>
  );
}

/** The warn dot that marks a full day (pill corner and legend). */
export function FullDot({ class: className }: { class: string }) {
  return <span aria-hidden="true" class={`absolute rounded-full bg-warn ${className}`} />;
}

export function SlotButton({ label, selected, onPick, compact = false, current = false }: {
  label: string;
  selected: boolean;
  onPick: () => void;
  compact?: boolean;
  /** The appointment's current hour (manage page): dashed and not selectable. */
  current?: boolean;
}) {
  const tone = current
    ? 'bg-surface border-dashed border-[#8A968F] text-ink-2 cursor-default'
    : selected
      ? 'bg-accent border-accent text-ink'
      : 'bg-white border-line text-ink hover:border-line-strong';
  const sizing = compact ? 'text-[14px] min-h-11' : 'text-[15px] max-[359px]:text-[14px] min-h-[46px]';
  return (
    <button
      type="button"
      class={`rounded-full font-semibold px-1 border-2 whitespace-nowrap transition-colors ${sizing} ${tone}`}
      aria-pressed={current ? undefined : selected}
      aria-label={current ? `${label}, tu cita actual` : undefined}
      disabled={current}
      onClick={onPick}
    >
      {label}
    </button>
  );
}

/** "Mañana" / "Tarde" title + 3-column grid of hours (booking step 2 and the manage page). */
export function SlotGroup({ title, slots, start, onPickSlot, format, compact = false, current }: {
  title: string;
  slots: string[];
  start: string | null;
  onPickSlot: (slot: string) => void;
  format: (slot: string) => string;
  compact?: boolean;
  current?: string;
}) {
  if (slots.length === 0) return null;
  return (
    <div class={`flex flex-col ${compact ? 'gap-2' : 'gap-2.5'}`}>
      <div class="text-[14px] font-semibold text-muted">{title}</div>
      <div class="grid grid-cols-3 gap-2">
        {slots.map((slot) => (
          <SlotButton
            key={slot}
            label={format(slot)}
            selected={slot === start}
            current={slot === current}
            compact={compact}
            onPick={() => onPickSlot(slot)}
          />
        ))}
      </div>
    </div>
  );
}

const NAV_BUTTON =
  'w-11 h-11 rounded-full border-0 bg-surface text-ink flex items-center justify-center hover:bg-line disabled:opacity-40 disabled:cursor-default disabled:hover:bg-surface';

/** "Octubre 2026" + previous / next week buttons above the day pills. */
export function WeekNav({ label, week, weeks, onWeek }: { label: string; week: number; weeks: number; onWeek: (week: number) => void }) {
  return (
    <div class="flex justify-between items-center gap-2">
      <span class="text-[14px] font-semibold text-muted">{label}</span>
      <div class="flex gap-1">
        <button type="button" aria-label="Semana anterior" class={NAV_BUTTON} disabled={week <= 0} onClick={() => onWeek(week - 1)}>
          <ChevronLeft size={16} strokeWidth={2.4} />
        </button>
        <button type="button" aria-label="Semana siguiente" class={NAV_BUTTON} disabled={week >= weeks - 1} onClick={() => onWeek(week + 1)}>
          <ChevronRight size={16} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  );
}

export function SkeletonPills({ count, columns }: { count: number; columns: 5 | 7 }) {
  return (
    <div class={`grid gap-1.5 ${columns === 7 ? 'grid-cols-7' : 'grid-cols-5'}`} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} class="skeleton rounded-[14px] min-h-16" />
      ))}
    </div>
  );
}

export function SkeletonSlots({ count = 6 }: { count?: number }) {
  return (
    <div class="grid grid-cols-3 gap-2" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} class="skeleton rounded-full min-h-[46px]" />
      ))}
    </div>
  );
}

export const PRIMARY_BUTTON =
  'h-14 w-full rounded-full border-0 bg-primary text-white font-bold text-[17px] flex items-center justify-center no-underline transition-colors hover:bg-primary-dark';
export const DISABLED_BUTTON =
  'h-14 w-full rounded-full border-0 bg-disabled text-muted font-bold text-[17px] cursor-not-allowed';
export const OUTLINE_BUTTON =
  'h-[52px] rounded-full border-2 border-line flex items-center justify-center gap-2.5 font-bold text-[15px] text-ink no-underline hover:border-line-strong hover:text-ink';
