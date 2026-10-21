/** Building blocks shared by the booking flow, the result screens and the manage page. */
import type { ComponentChildren } from 'preact';
import { Alert as AlertIcon } from './icons';

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

export function Avatar({ initials, size = 44, tone = 'green' }: { initials: string; size?: 44 | 64; tone?: 'green' | 'yellow' }) {
  const sizing = size === 64 ? 'w-16 h-16 text-[24px]' : 'w-11 h-11 text-[16px]';
  const colors = tone === 'yellow' ? 'bg-accent text-ink' : 'bg-primary text-white';
  return (
    <div
      class={`${sizing} ${colors} rounded-full flex items-center justify-center shrink-0 font-display font-extrabold`}
      aria-hidden="true"
    >
      {initials}
    </div>
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

/** Discreet links to the legal pages (Ley 1581). */
export function LegalLinks({ class: className = '' }: { class?: string }) {
  return (
    <nav aria-label="Legal" class={`flex justify-center gap-1.5 text-[12px] text-muted ${className}`}>
      <a href="/privacy" class="text-muted underline-offset-2 hover:text-ink-2">Privacidad</a>
      <span aria-hidden="true">·</span>
      <a href="/terms" class="text-muted underline-offset-2 hover:text-ink-2">Términos</a>
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

const DAY_BASE =
  'flex flex-col items-center justify-center gap-0.5 py-2.5 px-0 rounded-[14px] min-h-16 border-2 min-w-0 transition-colors';

export interface DayPillProps {
  dow: string;
  num: string;
  label: string;
  selected: boolean;
  disabled: boolean;
  onPick: () => void;
}

export function DayPill({ dow, num, label, selected, disabled, onPick }: DayPillProps) {
  const tone = disabled
    ? 'bg-surface border-surface text-faint cursor-default'
    : selected
      ? 'bg-primary border-primary text-white'
      : 'bg-white border-line text-ink hover:border-line-strong';
  return (
    <button type="button" class={`${DAY_BASE} ${tone}`} disabled={disabled} aria-pressed={selected} aria-label={label} onClick={onPick}>
      <span class="text-[12px] font-semibold">{dow}</span>
      <span class="text-[18px] font-bold">{num}</span>
    </button>
  );
}

export function SlotButton({ label, selected, onPick }: { label: string; selected: boolean; onPick: () => void }) {
  const tone = selected ? 'bg-accent border-accent text-ink' : 'bg-white border-line text-ink hover:border-line-strong';
  return (
    <button
      type="button"
      class={`rounded-full font-semibold text-[15px] max-[359px]:text-[14px] min-h-[46px] px-1 border-2 whitespace-nowrap transition-colors ${tone}`}
      aria-pressed={selected}
      onClick={onPick}
    >
      {label}
    </button>
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
