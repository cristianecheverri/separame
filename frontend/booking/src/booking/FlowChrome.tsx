/** Header (profile row + progress + selection chips) and sticky footer of the booking flow. */
import type { ComponentChildren } from 'preact';
import type { PublicProfile } from '@shared/api';
import { Avatar, Wordmark } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { joinDot, placeLine } from '../lib/text';

export type StepId = 'service' | 'when' | 'details' | 'review';

export const STEP_LABELS: Record<StepId, string> = {
  service: 'Servicio',
  when: 'Día y hora',
  details: 'Tus datos',
  review: 'Confirmar',
};

export interface SelectionChip {
  label: string;
  /** Screen-reader label, e.g. "Cambiar servicio: Valoración…". */
  title: string;
  /** Step the chip jumps back to (static chip when absent). */
  target?: StepId;
}

const CHIP =
  'inline-flex items-center h-8 px-3 rounded-full bg-primary-soft text-primary-dark text-[13px] font-semibold min-w-0 max-w-full';

function Chips({ chips, onChip }: { chips: SelectionChip[]; onChip: (step: StepId) => void }) {
  return (
    <div class="flex gap-1.5 min-w-0" role="list" aria-label="Lo que elegiste">
      {/* The service chip truncates first; the date chip stays whole. */}
      {chips.map((chip, i) => (
        <span key={chip.label} role="listitem" class={`flex min-w-0 ${i > 0 ? 'shrink-0' : 'shrink'}`}>
          {chip.target ? (
            <button type="button" onClick={() => chip.target && onChip(chip.target)} aria-label={chip.title} class={`${CHIP} border-0 hover:bg-mint`}>
              <span class="truncate">{chip.label}</span>
            </button>
          ) : (
            <span class={CHIP} title={chip.title}>
              <span class="truncate">{chip.label}</span>
            </span>
          )}
        </span>
      ))}
    </div>
  );
}

interface HeaderProps {
  profile: PublicProfile;
  /** 0-based position of the current step among the visible ones. */
  index: number;
  total: number;
  step: StepId;
  chips: SelectionChip[];
  onChip: (step: StepId) => void;
  onBack: () => void;
}

export function FlowHeader({ profile, index, total, step, chips, onChip, onBack }: HeaderProps) {
  return (
    <header class="safe-top border-b border-line shrink-0">
      <div class="px-4 py-3.5 flex flex-col gap-3.5">
        <ProfileRow profile={profile} onBack={index > 0 ? onBack : undefined} />
        <div class="flex flex-col gap-2">
          <div class={`grid gap-1.5 ${total === 3 ? 'grid-cols-3' : 'grid-cols-4'}`} aria-hidden="true">
            {Array.from({ length: total }, (_, i) => (
              <span key={i} class={`block h-1.5 rounded-full transition-colors ${i <= index ? 'bg-primary' : 'bg-line'}`} />
            ))}
          </div>
          <div class="text-[13px] font-semibold text-muted" aria-live="polite">
            Paso {index + 1} de {total} · {STEP_LABELS[step]}
          </div>
          {chips.length > 0 && <Chips chips={chips} onChip={onChip} />}
        </div>
      </div>
    </header>
  );
}

/** Avatar (or back button) + name + "sepárame." — the top row of every flow screen. */
export function ProfileRow({ profile, onBack, backLabel = 'Paso anterior' }: {
  profile: PublicProfile;
  onBack?: () => void;
  backLabel?: string;
}) {
  return (
    <div class="flex items-center gap-2.5 min-h-11">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          class="w-11 h-11 rounded-full border-0 bg-surface text-ink flex items-center justify-center shrink-0 hover:bg-line"
        >
          <ChevronLeft size={18} strokeWidth={2.4} />
        </button>
      ) : (
        <Avatar initials={profile.initials} />
      )}
      <div class="flex flex-col gap-px grow min-w-0">
        <div class="font-bold text-[15px] truncate">{profile.name}</div>
        <div class="text-[13px] text-muted truncate">{joinDot(profile.title, placeLine(profile))}</div>
      </div>
      <div class="shrink-0">
        <Wordmark size={16} />
      </div>
    </div>
  );
}

export function FlowFooter({ children }: { children: ComponentChildren }) {
  return (
    <footer class="shrink-0 border-t border-line bg-white safe-bottom">
      <div class="px-4 pt-3 pb-[18px] flex flex-col gap-2.5">{children}</div>
    </footer>
  );
}

export function StepTitle({ children, titleRef, class: className = '' }: {
  children: ComponentChildren;
  titleRef?: preact.Ref<HTMLHeadingElement>;
  class?: string;
}) {
  return (
    <h1 ref={titleRef} tabIndex={-1} class={`m-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px] ${className}`}>
      {children}
    </h1>
  );
}
