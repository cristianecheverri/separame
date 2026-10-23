/** Header (profile band or row + progress + selection chips) and sticky footer of the booking flow. */
import type { ComponentChildren } from 'preact';
import type { PublicProfile } from '@shared/api';
import { Avatar, MemberAvatar, Wordmark } from '../components/ui';
import { ChevronLeft, Phone, Pin, Users } from '../components/icons';
import { formatPhone, joinDot, placeLine, telHref } from '../lib/text';

/** `who` («¿Con quién?») only exists on team pages. */
export type StepId = 'who' | 'service' | 'when' | 'details' | 'review';

export const STEP_LABELS: Record<StepId, string> = {
  who: '¿Con quién?',
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
  /** Shows «· Cambiar» after the label (team pages: the «¿Con quién?» choice). */
  change?: boolean;
  /** Whether it truncates to make room; by default only the first chip does. */
  shrink?: boolean;
}

const CHIP =
  'inline-flex items-center h-8 short:h-7 px-3 rounded-full bg-primary-soft text-primary-dark text-[13px] font-semibold min-w-0 max-w-full';
/** The chip keeps its look; an invisible pseudo-element makes the tap target 44 px tall. */
const CHIP_HIT_AREA = "relative after:absolute after:inset-x-0 after:-inset-y-1.5 short:after:-inset-y-2 after:content-['']";

/**
 * What the client picked, at the top of the step. Short screens: one row
 * that scrolls sideways instead of truncating (the padding keeps the 44 px
 * hit areas inside the scroll box).
 */
function Chips({ chips, onChip }: { chips: SelectionChip[]; onChip: (step: StepId) => void }) {
  return (
    <div
      class="flex gap-1.5 min-w-0 mt-1 short:mt-0 short:overflow-x-auto short:-mx-4 short:px-4 short:py-2 short:-my-2 no-scrollbar"
      role="list"
      aria-label="Lo que elegiste"
    >
      {/* The service chip truncates first; the date chip stays whole. */}
      {chips.map((chip, i) => (
        <span key={chip.label} role="listitem" class={`flex min-w-0 short:shrink-0 ${(chip.shrink ?? i === 0) ? 'shrink' : 'shrink-0'}`}>
          {chip.target ? (
            <button type="button" onClick={() => chip.target && onChip(chip.target)} aria-label={chip.title} class={`${CHIP} ${CHIP_HIT_AREA} border-0 hover:bg-mint`}>
              <span class="truncate">{chip.label}</span>
              {chip.change && (
                <>
                  <span aria-hidden="true" class="shrink-0 mx-1.5">·</span>
                  <span class="shrink-0 underline">Cambiar</span>
                </>
              )}
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

const BAR_COLUMNS: Record<number, string> = { 3: 'grid-cols-3', 4: 'grid-cols-4', 5: 'grid-cols-5' };

function ProgressBars({ index, total, class: className = '' }: { index: number; total: number; class?: string }) {
  return (
    <div class={`grid ${BAR_COLUMNS[total] ?? 'grid-cols-4'} ${className}`} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} class={`block rounded-full transition-colors ${i <= index ? 'bg-primary' : 'bg-line'}`} />
      ))}
    </div>
  );
}

interface ProgressProps {
  /** 0-based position of the current step among the visible ones. */
  index: number;
  total: number;
  step: StepId;
  chips: SelectionChip[];
  onChip: (step: StepId) => void;
}

/** Bars + "Paso 2 de 4 · Día y hora" + chips. Short screens keep only the chips (the bars move into the profile row). */
function Progress({ index, total, step, chips, onChip }: ProgressProps) {
  return (
    <div class="flex flex-col gap-2 short:gap-0">
      <ProgressBars index={index} total={total} class="h-1.5 gap-1.5 short:hidden" />
      <div class="text-[13px] font-semibold text-muted short:sr-only" aria-live="polite">
        Paso {index + 1} de {total} · {STEP_LABELS[step]}
      </div>
      {chips.length > 0 && <Chips chips={chips} onChip={onChip} />}
    </div>
  );
}

interface HeaderProps extends ProgressProps {
  profile: PublicProfile;
  onBack: () => void;
}

/** Steps 2+ (and every step on short screens): compact profile row + progress, fixed above the step. */
export function FlowHeader({ profile, onBack, ...progress }: HeaderProps) {
  return (
    <header class="safe-top border-b border-line shrink-0">
      <div class="px-4 py-3.5 flex flex-col gap-3.5 short:py-2 short:gap-2">
        <ProfileRow profile={profile} onBack={progress.index > 0 ? onBack : undefined} progress={progress} />
        <Progress {...progress} />
      </div>
    </header>
  );
}

/** First step on regular screens: the full profile band, then the progress, all scrolling with the step. */
export function FlowIntro({ profile, members, ...progress }: ProgressProps & { profile: PublicProfile; members?: PublicProfile[] }) {
  return (
    <div>
      <ProfileBand profile={profile} members={members} details />
      <div class="pt-[18px] px-5">
        <Progress {...progress} />
      </div>
    </div>
  );
}

/** Team page band: the members' avatars overlapped + "3 profesionales". */
function MembersLine({ members }: { members: PublicProfile[] }) {
  return (
    <div class="flex gap-2.5 items-center">
      <div class="flex" aria-hidden="true">
        {members.map((m, i) => (
          <MemberAvatar key={m.slug} initials={m.initials} index={i} size={32} class={i > 0 ? '-ml-2' : ''} />
        ))}
      </div>
      <span class="text-[14px] text-mint">
        {members.length} {members.length === 1 ? 'profesional' : 'profesionales'}
      </span>
    </div>
  );
}

/** A team member's own page: «Parte de <consultorio>», linking to the team page. */
function TeamLink({ team }: { team: NonNullable<PublicProfile['team']> }) {
  return (
    <a
      href={`/${encodeURIComponent(team.slug)}`}
      class="self-start min-h-11 -mt-2.5 -mb-3 inline-flex items-center gap-1.5 text-[14px] font-semibold text-white underline underline-offset-[3px] hover:text-mint"
    >
      <Users size={16} class="shrink-0" />
      <span class="min-w-0 break-words">Parte de {team.name}</span>
    </a>
  );
}

/** Green profile band: booking step 1 (with address and "Llamar") and the unavailable page. */
export function ProfileBand({ profile, members, details = false }: { profile: PublicProfile; members?: PublicProfile[]; details?: boolean }) {
  const address = details ? joinDot(profile.address?.trim(), profile.neighborhood?.trim()) : '';
  const phone = details && profile.phone ? profile.phone.replace(/\D/g, '') : '';
  return (
    <div class="safe-top bg-primary text-white rounded-b-[28px] shrink-0">
      <div class={`pt-[18px] px-5 flex flex-col ${details ? 'pb-6 gap-[18px]' : 'pb-7 gap-[22px]'}`}>
        <Wordmark onGreen />
        <div class="flex gap-3.5 items-center">
          <Avatar initials={profile.initials} size={64} tone="yellow" />
          <div class="flex flex-col gap-1 min-w-0">
            <h1 class="m-0 font-display font-extrabold text-[26px] leading-[1.1] tracking-[-0.5px] break-words line-clamp-2">{profile.name}</h1>
            <div class="text-[15px] text-mint">{joinDot(profile.title, profile.city)}</div>
            {profile.team && <TeamLink team={profile.team} />}
          </div>
        </div>
        {members && members.length > 0 && <MembersLine members={members} />}
        {address && (
          <div class="flex gap-2 items-start text-[14px] text-mint leading-[1.4]">
            <Pin size={18} class="shrink-0 mt-px" />
            <span class="min-w-0 break-words">{address}</span>
          </div>
        )}
        {phone && (
          <a
            href={telHref(phone)}
            class="self-start h-11 px-[18px] rounded-full bg-white/14 text-white inline-flex items-center gap-2 font-bold text-[15px] no-underline whitespace-nowrap hover:bg-white/20 hover:text-white"
          >
            <Phone size={18} />
            Llamar · {formatPhone(phone)}
          </a>
        )}
      </div>
    </div>
  );
}

/**
 * Avatar (or back button) + name + "sepárame." — the top row of every flow
 * screen. Below 360 px the wordmark gives its room to the name; short screens
 * shrink the row and show the step bars on the right instead.
 */
export function ProfileRow({ profile, onBack, backLabel = 'Paso anterior', progress }: {
  profile: PublicProfile;
  onBack?: () => void;
  backLabel?: string;
  progress?: { index: number; total: number };
}) {
  return (
    <div class="flex items-center gap-2.5 min-h-11 short:min-h-9">
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          aria-label={backLabel}
          class="group w-11 h-11 short:-m-1 rounded-full border-0 bg-transparent p-0 text-ink flex items-center justify-center shrink-0"
        >
          <span class="w-11 h-11 short:w-9 short:h-9 rounded-full bg-surface flex items-center justify-center group-hover:bg-line">
            <ChevronLeft size={18} strokeWidth={2.4} class="short:w-4 short:h-4" />
          </span>
        </button>
      ) : (
        <Avatar initials={profile.initials} class="short:w-9 short:h-9 short:text-[14px]" />
      )}
      <div class="flex flex-col gap-px short:gap-0 grow min-w-0">
        <div class="font-bold text-[15px] short:text-[14px] truncate">{profile.name}</div>
        <div class="text-[13px] short:text-[12px] text-muted truncate">{joinDot(profile.title, placeLine(profile))}</div>
      </div>
      <div class="shrink-0 max-[359px]:hidden short:hidden">
        <Wordmark size={16} />
      </div>
      {progress && <ProgressBars index={progress.index} total={progress.total} class="hidden short:grid w-[88px] h-1 gap-1 shrink-0" />}
    </div>
  );
}

export function FlowFooter({ children }: { children: ComponentChildren }) {
  return (
    <footer class="shrink-0 border-t border-line bg-white safe-bottom">
      <div class="px-4 pt-3 pb-[18px] flex flex-col gap-2.5 short:pt-2 short:pb-2.5 short:gap-2 short:[&>button]:h-[46px] short:[&>button]:text-[16px]">
        {children}
      </div>
    </footer>
  );
}

export function StepTitle({ children, titleRef, as: Tag = 'h1', class: className = '' }: {
  children: ComponentChildren;
  titleRef?: preact.Ref<HTMLHeadingElement>;
  /** h2 under the profile band (the professional's name is the h1 there). */
  as?: 'h1' | 'h2';
  class?: string;
}) {
  return (
    <Tag
      ref={titleRef}
      tabIndex={-1}
      class={`m-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px] short:text-[22px] short:tracking-[-0.4px] ${className}`}
    >
      {children}
    </Tag>
  );
}
