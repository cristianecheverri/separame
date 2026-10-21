import type { PublicProfile } from '@shared/api';
import { CalendarX, Check, Phone } from '../components/icons';
import { Frame, MadeWith, OUTLINE_BUTTON, Wordmark } from '../components/ui';
import { ProfileBand } from './FlowChrome';
import { formatPhone, telHref } from '../lib/text';

/** Subscription expired — never mention payment. */
export function Unavailable({ profile }: { profile: PublicProfile }) {
  const phone = profile.phone ? profile.phone.replace(/\D/g, '') : '';
  return (
    <Frame label="Agenda no disponible">
      <main class="scroll-area">
        <div class="min-h-full flex flex-col">
          <ProfileBand profile={profile} />
          <div class="pt-7 px-5 pb-6 flex flex-col gap-[18px] grow safe-bottom">
            <div class="w-14 h-14 rounded-[18px] bg-accent-soft flex items-center justify-center">
              <CalendarX size={28} stroke="#15241D" />
            </div>
            <h2 class="m-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]">Agenda no disponible temporalmente</h2>
            <div class="text-[16px] text-ink-2 leading-[1.5]">
              En este momento no se pueden separar citas en línea con {profile.name}. Vuelve a intentarlo más
              adelante.
            </div>
            <div class="bg-primary-soft rounded-[20px] p-4 flex gap-3 items-start text-[14px] leading-[1.45]">
              <Check size={20} strokeWidth={2.2} stroke="#0B6E4F" class="shrink-0 mt-px" />
              <span>
                <strong>¿Ya tenías una cita?</strong> Sigue en pie. Te llegará el recordatorio y puedes cancelarla o cambiarla desde el
                enlace de tu correo.
              </span>
            </div>
            {phone && (
              <div class="flex flex-col gap-2.5 mt-1">
                <div class="text-[14px] font-bold">Contacto del consultorio</div>
                <a href={telHref(phone)} class={OUTLINE_BUTTON}>
                  <Phone size={18} />
                  Llamar · {formatPhone(phone)}
                </a>
              </div>
            )}
            <MadeWith />
          </div>
        </div>
      </main>
    </Frame>
  );
}

/** Unknown slug or broken link inside the booking bundle. */
export function MissingScreen({ title, text, actionLabel = 'Ir a sepárame.app', actionHref = '/' }: {
  title: string;
  text: string;
  actionLabel?: string;
  actionHref?: string;
}) {
  return (
    <Frame label={title}>
      <main class="scroll-area">
        <div class="min-h-full flex flex-col pt-7 px-5 pb-6 gap-[18px] safe-top safe-bottom">
          <Wordmark />
          <div class="w-14 h-14 rounded-[18px] bg-accent-soft flex items-center justify-center mt-2">
            <CalendarX size={28} stroke="#15241D" />
          </div>
          <h1 class="m-0 font-display font-extrabold text-[28px] leading-[1.1] tracking-[-0.6px]">{title}</h1>
          <div class="text-[16px] text-ink-2 leading-[1.5]">{text}</div>
          <a href={actionHref} class="text-[15px] font-bold">{actionLabel}</a>
          <MadeWith />
        </div>
      </main>
    </Frame>
  );
}
