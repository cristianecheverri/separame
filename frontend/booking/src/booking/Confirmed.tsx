import type { CreateBookingResponse } from '@shared/api';
import { formatCop, formatDuration, formatWhen } from '@shared/format';
import { SITE_PATHS } from '@shared/infra';
import { CalendarIcon, CalendarPlus, Check, Mail, Pin } from '../components/icons';
import { Avatar, Frame, LegalLinks, OUTLINE_BUTTON, PageScroll, Wordmark } from '../components/ui';
import { eventFromBooking, googleCalendarUrl, icsDataUrl, outlookCalendarUrl } from '../lib/calendar';
import { firstName, fullAddress, joinDot } from '../lib/text';

export function manageUrlFor(token: string): string {
  return `${location.origin}${SITE_PATHS.manage}${encodeURIComponent(token)}`;
}

export function Confirmed({ result }: { result: CreateBookingResponse }) {
  const { booking, manageToken } = result;
  const { pro } = booking;
  const manageUrl = manageUrlFor(manageToken);
  const event = eventFromBooking(booking, manageUrl);
  const place = fullAddress(pro, true);

  return (
    <Frame label="Cita confirmada">
      <PageScroll class="pt-7 px-5 pb-6 gap-[22px]">
        <Wordmark />
        <div class="flex flex-col items-start gap-3.5">
          <div class="w-16 h-16 rounded-full bg-accent text-ink flex items-center justify-center">
            <Check size={32} strokeWidth={2.6} />
          </div>
          <h1 class="m-0 font-display font-extrabold text-[32px] leading-[1.05] tracking-[-0.8px]">
            ¡Listo, {firstName(booking.client.name)}! Tu cita quedó separada.
          </h1>
        </div>

        <div class="bg-primary-soft rounded-[22px] p-[18px] flex flex-col gap-3.5">
          <div class="flex gap-3 items-center">
            <Avatar initials={pro.initials} />
            <div class="flex flex-col gap-0.5 min-w-0">
              <div class="font-bold text-[16px]">{pro.name}</div>
              <div class="text-[14px] text-ink-2">
                {joinDot(booking.serviceName, formatDuration(booking.durationMin), formatCop(booking.priceCop))}
              </div>
            </div>
          </div>
          <div class="h-px bg-primary-line" />
          <div class="flex gap-2.5 items-center text-[15px] font-semibold">
            <CalendarIcon size={20} stroke="#0B6E4F" class="shrink-0" />
            {formatWhen(booking.start)}
          </div>
          {place && (
            <div class="flex gap-2.5 items-start text-[15px] leading-[1.4]">
              <Pin size={20} stroke="#0B6E4F" class="shrink-0" />
              {place}
            </div>
          )}
        </div>

        <div class="flex flex-col gap-2.5">
          <div class="text-[14px] font-bold">Agrégala a tu calendario</div>
          <a href={googleCalendarUrl(event)} target="_blank" rel="noopener" class={OUTLINE_BUTTON}>
            <CalendarPlus size={20} />
            Google Calendar
          </a>
          <a href={outlookCalendarUrl(event)} target="_blank" rel="noopener" class={OUTLINE_BUTTON}>
            <CalendarPlus size={20} />
            Outlook
          </a>
          <a href={icsDataUrl(event)} download="cita-separame.ics" class="text-[14px] font-semibold text-center py-1.5">
            Descargar archivo .ics
          </a>
        </div>

        <div class="flex gap-2.5 items-start text-[14px] text-ink-2 leading-[1.45]">
          <Mail size={20} class="shrink-0" />
          <span class="min-w-0 [overflow-wrap:anywhere]">
            Te enviamos la confirmación a <strong>{booking.client.email}</strong>. Te recordamos un día antes.
          </span>
        </div>

        <div class="mt-auto flex flex-col gap-2.5 items-center">
          <a href={`${SITE_PATHS.manage}${encodeURIComponent(manageToken)}`} class="text-[15px] font-bold">
            Cancelar o reprogramar
          </a>
          <a href={`/${encodeURIComponent(pro.slug)}`} class="text-[14px] text-muted hover:text-ink-2">
            Volver a la agenda
          </a>
          <LegalLinks class="pt-1" />
        </div>
      </PageScroll>
    </Frame>
  );
}
