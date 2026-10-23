import { useState } from 'preact/hooks';
import type { CreateBookingResponse } from '@shared/api';
import { formatDuration, formatServicePrice } from '@shared/format';
import { SITE_PATHS } from '@shared/infra';
import { Alert, CalendarIcon, CalendarPlus, Check, Download, GoogleCalendarMark, Mail, OutlookMark, Pin } from '../components/icons';
import { Avatar, Frame, LegalLinks, PageScroll, PRIMARY_BUTTON, Wordmark } from '../components/ui';
import { track } from '../lib/analytics';
import { calendarPlatform, eventFromBooking, googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from '../lib/calendar';
import { firstName, fullAddress, joinDot } from '../lib/text';
import { whenLabel } from '../lib/when';

export function manageUrlFor(token: string): string {
  return `${location.origin}${SITE_PATHS.manage}${encodeURIComponent(token)}`;
}

/** Text links stacked at the bottom: 44 px tall hit areas, negative margins keep the visual rhythm. */
const BOTTOM_LINK = 'inline-flex items-center min-h-11 px-3 -my-2';
const CALENDAR_PRIMARY = `${PRIMARY_BUTTON.replace('text-[17px]', 'text-[16px]')} gap-2.5 hover:text-white`;
const CALENDAR_OTHER =
  'h-12 rounded-full border-2 border-line bg-white flex items-center justify-center gap-2 font-bold text-[14px] text-ink no-underline whitespace-nowrap hover:border-line-strong hover:text-ink';
const MANAGE_BUTTON =
  'h-11 rounded-full border-2 border-line flex items-center justify-center font-bold text-[15px] text-primary no-underline hover:border-line-strong';

/**
 * The phone's own calendar first: iPhone / iPad open the .ics (Safari offers
 * "Agregar al calendario"); Android and computers get Google Calendar.
 * The rest goes under "Otros calendarios".
 */
function CalendarButtons({ event, icsUrl }: { event: CalendarEvent; icsUrl: string }) {
  const platform = calendarPlatform();
  const apple = platform === 'iphone' || platform === 'ipad';
  const google = googleCalendarUrl(event);
  return (
    <div class="flex flex-col gap-2.5">
      {apple ? (
        <a href={icsUrl} class={CALENDAR_PRIMARY} onClick={() => track('add_to_calendar', { method: 'device' })}>
          <CalendarPlus size={22} />
          Agregar al calendario del {platform === 'ipad' ? 'iPad' : 'iPhone'}
        </a>
      ) : (
        <a href={google} target="_blank" rel="noopener" class={CALENDAR_PRIMARY} onClick={() => track('add_to_calendar', { method: 'google' })}>
          <CalendarPlus size={22} />
          Agregar a Google Calendar
        </a>
      )}
      <div class="text-[13px] font-bold text-ink-2 pt-1">Otros calendarios</div>
      <div class="grid grid-cols-2 gap-2">
        {apple && (
          <a
            href={google}
            target="_blank"
            rel="noopener"
            aria-label="Agregar a Google Calendar"
            class={CALENDAR_OTHER}
            onClick={() => track('add_to_calendar', { method: 'google' })}
          >
            <GoogleCalendarMark />
            Google
          </a>
        )}
        <a
          href={outlookCalendarUrl(event)}
          target="_blank"
          rel="noopener"
          aria-label="Agregar a Outlook"
          class={CALENDAR_OTHER}
          onClick={() => track('add_to_calendar', { method: 'outlook' })}
        >
          <OutlookMark />
          Outlook
        </a>
        {!apple && (
          <a
            href={icsUrl}
            download="cita-separame.ics"
            aria-label="Descargar archivo .ics"
            class={CALENDAR_OTHER}
            onClick={() => track('add_to_calendar', { method: 'ics' })}
          >
            <Download size={18} />
            Archivo .ics
          </a>
        )}
      </div>
    </div>
  );
}

export function Confirmed({ result, icsUrl, agendaSlug, onRestart }: {
  result: CreateBookingResponse;
  icsUrl: string;
  /** "Volver a la agenda" target: the team page when booked from it (default: the professional's page). */
  agendaSlug?: string;
  /**
   * The link points to this very page, whose history state says "done": navigating would show the
   * confirmation again. The booking app starts a fresh booking instead (the href stays for new tabs).
   */
  onRestart?: () => void;
}) {
  const { booking, manageToken } = result;
  const { pro } = booking;
  const manageUrl = manageUrlFor(manageToken);
  const event = eventFromBooking(booking, manageUrl);
  const place = fullAddress(pro, true);

  return (
    <Frame label="Cita confirmada">
      <PageScroll class="pt-7 px-5 pb-6 gap-5">
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
                {joinDot(booking.serviceName, formatDuration(booking.durationMin), formatServicePrice(booking))}
              </div>
            </div>
          </div>
          <div class="h-px bg-primary-line" />
          <div class="flex gap-2.5 items-center text-[15px] font-semibold">
            <CalendarIcon size={20} stroke="#0B6E4F" class="shrink-0" />
            {whenLabel(booking.start)}
          </div>
          {place && (
            <div class="flex gap-2.5 items-start text-[15px] leading-[1.4]">
              <Pin size={20} stroke="#0B6E4F" class="shrink-0" />
              {place}
            </div>
          )}
        </div>

        <CalendarButtons event={event} icsUrl={icsUrl} />

        {booking.client.email ? (
          <div class="flex gap-2.5 items-start text-[14px] text-ink-2 leading-[1.45]">
            <Mail size={20} class="shrink-0" />
            <span class="min-w-0 [overflow-wrap:anywhere]">
              Te enviamos la confirmación a <strong>{booking.client.email}</strong>. Te recordamos un día antes.
            </span>
          </div>
        ) : (
          <SaveLinkNotice url={manageUrl} />
        )}

        <div class="mt-auto flex flex-col gap-2.5">
          <a href={`${SITE_PATHS.manage}${encodeURIComponent(manageToken)}`} class={MANAGE_BUTTON}>
            Cancelar o reprogramar
          </a>
          <div class="flex flex-col items-center gap-1">
            <a
              href={`/${encodeURIComponent(agendaSlug ?? pro.slug)}`}
              class={`${BOTTOM_LINK} text-[14px] text-muted hover:text-ink-2`}
              onClick={(event) => {
                if (!onRestart || event.metaKey || event.ctrlKey || event.shiftKey) return;
                event.preventDefault();
                onRestart();
              }}
            >
              Volver a la agenda
            </a>
            <LegalLinks />
          </div>
        </div>
      </PageScroll>
    </Frame>
  );
}

/** Booked without an email: nothing will reach the client, so the manage link must be kept by hand. */
function SaveLinkNotice({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const selectField = () => (document.getElementById('c-manage-link') as HTMLInputElement | null)?.select();
  const copy = () => {
    const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
    if (!clipboard) return selectField();
    clipboard.writeText(url).then(() => setCopied(true), selectField);
  };

  return (
    <div class="bg-accent-soft rounded-[18px] p-4 flex flex-col gap-3">
      <div class="flex gap-2.5 items-start text-[14px] text-ink leading-[1.45]">
        <Alert size={20} class="shrink-0" />
        <span>
          <strong>No te enviaremos correos</strong> porque no dejaste uno. Guarda este enlace para cancelar o cambiar tu cita:
        </span>
      </div>
      <div class="flex gap-2 items-center">
        <input
          id="c-manage-link"
          class="field h-11 text-[14px] grow"
          type="text"
          readOnly
          value={url}
          aria-label="Enlace para cancelar o cambiar tu cita"
          onFocus={(e) => (e.currentTarget as HTMLInputElement).select()}
        />
        <button
          type="button"
          onClick={copy}
          class="h-11 px-4 rounded-full border-0 bg-primary text-white font-bold text-[15px] shrink-0 hover:bg-primary-dark"
        >
          {copied ? 'Copiado' : 'Copiar'}
        </button>
      </div>
      <span class="sr-only" role="status">{copied ? 'Enlace copiado' : ''}</span>
    </div>
  );
}
