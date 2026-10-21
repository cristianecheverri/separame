import { icsDate } from './ics';

/**
 * "Agregar a Google Calendar" / "Agregar a Outlook" template links — no OAuth,
 * the client's calendar app opens a prefilled event.
 */

export interface CalendarEvent {
  title: string;
  start: string;
  end: string;
  details: string;
  location: string;
}

export function googleCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${icsDate(e.start)}/${icsDate(e.end)}`,
    details: e.details,
    location: e.location,
    ctz: 'America/Bogota',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook.com / personal Microsoft accounts compose deeplink. */
export function outlookCalendarUrl(e: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: e.title,
    startdt: new Date(e.start).toISOString(),
    enddt: new Date(e.end).toISOString(),
    body: e.details,
    location: e.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}
