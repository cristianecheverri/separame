/**
 * Minimal RFC 5545 calendar file for the confirmation / change emails. Same
 * UID for the life of the appointment and an increasing SEQUENCE, so calendar
 * apps update the event in place when it is rescheduled.
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
  organizerName?: string;
}

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

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Separame//Citas//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
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
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.summary)}`,
    'TRIGGER:-PT1H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
