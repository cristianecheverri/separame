/**
 * "Add to calendar" without OAuth: Google Calendar and Outlook template links
 * plus a downloadable .ics, all generated in the browser from the booking.
 */
import type { BookingSummary } from '@shared/api';
import { formatDuration } from '@shared/format';

export interface CalendarEvent {
  uid: string;
  title: string;
  start: string;
  end: string;
  location: string;
  description: string;
}

export function eventFromBooking(booking: BookingSummary, manageUrl: string): CalendarEvent {
  const { pro } = booking;
  const location = [pro.address, pro.neighborhood, pro.city].map((p) => p?.trim()).filter(Boolean).join(', ');
  return {
    uid: `${booking.appointmentId}@separame.app`,
    title: `${booking.serviceName} · ${pro.name}`,
    start: booking.start,
    end: booking.end,
    location,
    description: `${booking.serviceName} (${formatDuration(booking.durationMin)}) con ${pro.name}.\nCancelar o reprogramar: ${manageUrl}`,
  };
}

/** 2026-10-22T15:00:00.000Z → 20261022T150000Z */
function compactUtc(instant: string): string {
  return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function googleCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${compactUtc(event.start)}/${compactUtc(event.end)}`,
    details: event.description,
    location: event.location,
    ctz: 'America/Bogota',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export function outlookCalendarUrl(event: CalendarEvent): string {
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: event.title,
    startdt: new Date(event.start).toISOString(),
    enddt: new Date(event.end).toISOString(),
    body: event.description,
    location: event.location,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function escapeIcs(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** RFC 5545 line folding at 75 octets (approximated by characters). */
function fold(line: string): string {
  const chunks: string[] = [];
  for (let i = 0; i < line.length; i += 73) chunks.push(line.slice(i, i + 73));
  return chunks.join('\r\n ');
}

export function icsContent(event: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Separame//Booking//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${compactUtc(now.toISOString())}`,
    `DTSTART:${compactUtc(event.start)}`,
    `DTEND:${compactUtc(event.end)}`,
    `SUMMARY:${escapeIcs(event.title)}`,
    `LOCATION:${escapeIcs(event.location)}`,
    `DESCRIPTION:${escapeIcs(event.description)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT1H',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(event.title)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function icsDataUrl(event: CalendarEvent): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(icsContent(event))}`;
}
