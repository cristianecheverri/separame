/**
 * Minimal RFC 5545 writer: the client's .ics (METHOD:PUBLISH), the pro's
 * calendar invitations (METHOD:REQUEST / CANCEL) and the pro's subscription
 * feed. Same UID for the life of an appointment and an increasing SEQUENCE,
 * so calendar apps update (or remove) the event in place. CRLF line endings,
 * 75-octet folding, text escaping.
 */

export interface IcsEvent {
  uid: string;
  start: string;
  end: string;
  summary: string;
  description: string;
  location: string;
  /** Monotonic revision (e.g. seconds of `updatedAt`). */
  sequence: number;
  url?: string;
  stamp?: Date;
  status?: 'CONFIRMED' | 'CANCELLED';
  /** Invitations: `ORGANIZER;CN=…:mailto:…`. */
  organizer?: { name: string; email: string };
  /** Invitations: already-accepted attendees (no RSVP). */
  attendees?: { name: string; email: string }[];
  /** 1 h display alarm (client .ics only). */
  alarm?: boolean;
}

export type IcsMethod = 'PUBLISH' | 'REQUEST' | 'CANCEL';

/** 2026-10-22T15:00:00.000Z → 20261022T150000Z */
export const icsDate = (instant: string | Date): string =>
  new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function escapeText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds a content line at 75 octets without splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let current = '';
  let bytes = 0;
  for (const ch of line) {
    const size = Buffer.byteLength(ch, 'utf8');
    const limit = out.length === 0 ? 75 : 74; // continuation lines start with a space
    if (bytes + size > limit) {
      out.push(current);
      current = '';
      bytes = 0;
    }
    current += ch;
    bytes += size;
  }
  out.push(current);
  return out.join('\r\n ');
}

/** Parameter value (CN=…): quoted only when it has `:;,`; DQUOTE isn't allowed at all, so it is dropped. */
export function paramValue(value: string): string {
  const clean = value.replace(/"/g, '').replace(/[\r\n]/g, ' ');
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}

export function eventLines(event: IcsEvent): string[] {
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${icsDate(event.stamp ?? new Date())}`,
    `DTSTART:${icsDate(event.start)}`,
    `DTEND:${icsDate(event.end)}`,
    `SEQUENCE:${event.sequence}`,
    `SUMMARY:${escapeText(event.summary)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    ...(event.location ? [`LOCATION:${escapeText(event.location)}`] : []),
    ...(event.url ? [`URL:${event.url}`] : []),
    ...(event.organizer ? [`ORGANIZER;CN=${paramValue(event.organizer.name)}:mailto:${event.organizer.email}`] : []),
    ...(event.attendees ?? []).map(
      (a) => `ATTENDEE;CN=${paramValue(a.name)};ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;RSVP=FALSE:mailto:${a.email}`,
    ),
    `STATUS:${event.status ?? 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    ...(event.alarm
      ? ['BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escapeText(event.summary)}`, 'TRIGGER:-PT1H', 'END:VALARM']
      : []),
    'END:VEVENT',
  ];
}

export interface IcsCalendar {
  method: IcsMethod;
  prodId?: string;
  /** Extra calendar properties (X-WR-CALNAME…), already formatted. */
  headers?: string[];
  events: IcsEvent[];
}

export function buildCalendar(cal: IcsCalendar): string {
  const lines = [
    'BEGIN:VCALENDAR',
    `PRODID:${cal.prodId ?? '-//Separame//Citas//ES'}`,
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    `METHOD:${cal.method}`,
    ...(cal.headers ?? []),
    ...cal.events.flatMap(eventLines),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

/** The client's calendar file (confirmation / change emails). */
export function buildIcs(event: IcsEvent): string {
  return buildCalendar({ method: 'PUBLISH', events: [{ alarm: true, ...event }] });
}
