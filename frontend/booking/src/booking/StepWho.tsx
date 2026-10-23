/** Team page, step 1: «¿Con quién quieres tu cita?» — «Cualquiera disponible» first, then each professional. */
import type { ComponentChildren } from 'preact';
import type { PublicTeam } from '@shared/api';
import { Users } from '../components/icons';
import { MemberAvatar } from '../components/ui';
import { ANY_PRO } from '../lib/team';
import { StepTitle } from './FlowChrome';

interface Props {
  team: PublicTeam;
  /** A member's slug, ANY_PRO, or null before picking. */
  who: string | null;
  onPick: (who: string) => void;
  titleRef: preact.Ref<HTMLHeadingElement>;
  titleAs: 'h1' | 'h2';
}

function Choice({ selected, onPick, avatar, title, sub }: {
  selected: boolean;
  onPick: () => void;
  avatar: ComponentChildren;
  title: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      class={`flex items-center gap-3.5 w-full text-left px-4 py-3.5 rounded-[20px] min-h-[72px] border-2 text-ink transition-colors ${
        selected ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-line-strong'
      }`}
    >
      <span
        aria-hidden="true"
        class={`w-[22px] h-[22px] rounded-full shrink-0 bg-white ${selected ? 'border-[7px] border-primary' : 'border-2 border-radio'}`}
      />
      {avatar}
      <span class="flex flex-col gap-[3px] grow min-w-0">
        <span class="font-bold text-[17px] break-words">{title}</span>
        {sub && <span class="text-[14px] text-muted leading-[1.3]">{sub}</span>}
      </span>
    </button>
  );
}

export function StepWho({ team, who, onPick, titleRef, titleAs }: Props) {
  return (
    <section class="flex flex-col gap-3">
      <StepTitle titleRef={titleRef} as={titleAs} class="mb-1">¿Con quién quieres tu cita?</StepTitle>
      <Choice
        selected={who === ANY_PRO}
        onPick={() => onPick(ANY_PRO)}
        avatar={
          <span aria-hidden="true" class="w-11 h-11 rounded-full bg-accent-soft text-ink flex items-center justify-center shrink-0">
            <Users size={22} />
          </span>
        }
        title="Cualquiera disponible"
        sub="Te mostramos las horas libres de todo el equipo"
      />
      {team.members.map((member, i) => (
        <Choice
          key={member.slug}
          selected={who === member.slug}
          onPick={() => onPick(member.slug)}
          avatar={<MemberAvatar initials={member.initials} index={i} />}
          title={member.name}
          sub={member.title}
        />
      ))}
    </section>
  );
}
