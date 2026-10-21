import type { PublicProfile } from '@shared/api';
import { formatCop, formatDuration } from '@shared/format';
import { joinDot, PRICE_NOTE } from '../lib/text';
import { StepTitle } from './FlowChrome';

interface Props {
  profile: PublicProfile;
  serviceId: string | null;
  onPick: (serviceId: string) => void;
  titleRef: preact.Ref<HTMLHeadingElement>;
}

export function StepService({ profile, serviceId, onPick, titleRef }: Props) {
  return (
    <section class="flex flex-col gap-3">
      <StepTitle titleRef={titleRef} class="mb-1">¿Qué necesitas?</StepTitle>
      {profile.services.map((service) => {
        const selected = service.id === serviceId;
        return (
          <button
            key={service.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onPick(service.id)}
            class={`flex items-center gap-3.5 w-full text-left p-4 rounded-[20px] min-h-[84px] border-2 text-ink transition-colors ${
              selected ? 'border-primary bg-primary-soft' : 'border-line bg-white hover:border-line-strong'
            }`}
          >
            <span
              aria-hidden="true"
              class={`w-[22px] h-[22px] rounded-full shrink-0 bg-white ${selected ? 'border-[7px] border-primary' : 'border-2 border-radio'}`}
            />
            <span class="flex flex-col gap-[3px] grow min-w-0">
              <span class="font-bold text-[17px]">{service.name}</span>
              <span class="text-[14px] text-muted">{joinDot(formatDuration(service.durationMin), service.description)}</span>
            </span>
            <span class="font-bold text-[15px] shrink-0 whitespace-nowrap">{formatCop(service.priceCop)}</span>
          </button>
        );
      })}
      {profile.services.length === 0 && (
        <div class="bg-surface rounded-[18px] p-[18px] text-[14px] text-ink-2 text-center">
          Por ahora no hay servicios disponibles para separar en línea.
        </div>
      )}
      <div class="text-[13px] text-muted">{PRICE_NOTE}</div>
    </section>
  );
}
