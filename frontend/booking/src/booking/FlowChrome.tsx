/** Header (profile row + progress) and sticky footer of the 4-step flow. */
import type { ComponentChildren } from 'preact';
import type { PublicProfile } from '@shared/api';
import { Avatar, Wordmark } from '../components/ui';
import { ChevronLeft } from '../components/icons';
import { joinDot, placeLine } from '../lib/text';

export const STEP_NAMES = ['Servicio', 'Día y hora', 'Tus datos', 'Confirmar'] as const;
export type Step = 1 | 2 | 3 | 4;

export function FlowHeader({ profile, step, onBack }: { profile: PublicProfile; step: Step; onBack: () => void }) {
  return (
    <header class="safe-top border-b border-line shrink-0">
      <div class="px-4 py-3.5 flex flex-col gap-3.5">
        <div class="flex items-center gap-2.5 min-h-11">
          {step > 1 ? (
            <button
              type="button"
              onClick={onBack}
              aria-label="Paso anterior"
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
        <div class="flex flex-col gap-2">
          <div class="grid grid-cols-4 gap-1.5" aria-hidden="true">
            {STEP_NAMES.map((name, i) => (
              <span key={name} class={`block h-1.5 rounded-full transition-colors ${i < step ? 'bg-primary' : 'bg-line'}`} />
            ))}
          </div>
          <div class="text-[13px] font-semibold text-muted" aria-live="polite">
            Paso {step} de 4 · {STEP_NAMES[step - 1]}
          </div>
        </div>
      </div>
    </header>
  );
}

export function FlowFooter({ summary, children }: { summary: string; children: ComponentChildren }) {
  return (
    <footer class="shrink-0 border-t border-line bg-white safe-bottom">
      <div class="px-4 pt-3 pb-[18px] flex flex-col gap-2.5">
        {summary && (
          <div class="flex gap-2 items-center text-[13px] text-ink-2 min-w-0">
            <span class="w-2 h-2 rounded-full bg-accent shrink-0" aria-hidden="true" />
            <span class="whitespace-nowrap overflow-hidden text-ellipsis">{summary}</span>
          </div>
        )}
        {children}
      </div>
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
