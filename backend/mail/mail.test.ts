import { describe, expect, it } from 'vitest';
import { googleCalendarUrl, outlookCalendarUrl } from './calendar-links';
import { buildIcs, escapeText, foldLine } from './ics';
import { buildRawMessage, encodeHeader, formatFrom } from './sender';

describe('headers', () => {
  it('RFC 2047-encodes non-ASCII display names and subjects', () => {
    expect(formatFrom('Sepárame <noreply@separame.app>')).toBe(`=?UTF-8?B?${Buffer.from('Sepárame').toString('base64')}?= <noreply@separame.app>`);
    expect(formatFrom('noreply@separame.app')).toMatch(/^=\?UTF-8\?B\?.+\?= <noreply@separame\.app>$/);
    expect(encodeHeader('Hello')).toBe('Hello');
    const long = encodeHeader('Cita confirmada · jue 22 oct., 10:00 a. m. · Dra. Laura Pérez');
    expect(long.split('\r\n ').every((w) => w.length <= 75)).toBe(true);
  });

  it('builds multipart MIME with text, html and the attachment', () => {
    const raw = buildRawMessage({
      to: 'a@b.co', replyTo: 'pro@b.co', subject: 'Cita', html: '<p>Hola</p>', text: 'Hola',
      attachments: [{ filename: 'cita.ics', contentType: 'text/calendar; charset=UTF-8; method=PUBLISH', content: 'BEGIN:VCALENDAR' }],
    }, 'X <noreply@separame.app>');
    expect(raw).toMatch(/Content-Type: multipart\/mixed/);
    expect(raw).toMatch(/Content-Type: multipart\/alternative/);
    expect(raw).toContain('Content-Type: text/plain; charset=UTF-8');
    expect(raw).toContain('Content-Type: text/html; charset=UTF-8');
    expect(raw).toContain('Content-Disposition: attachment; filename="cita.ics"');
    expect(raw).toContain(Buffer.from('BEGIN:VCALENDAR').toString('base64'));
  });
});

describe('ics', () => {
  const ics = buildIcs({
    uid: 'appt1@separame.app', start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z',
    summary: 'Valoración con Dra. Laura Pérez', description: 'Cambiar: https://separame.app/c/x', location: 'Cra. 43A, Medellín',
    sequence: 3, stamp: new Date('2026-10-20T00:00:00Z'),
  });

  it('has CRLF lines, UTC times and a stable UID', () => {
    expect(ics).toContain('DTSTART:20261022T150000Z\r\n');
    expect(ics).toContain('DTEND:20261022T153000Z\r\n');
    expect(ics).toContain('UID:appt1@separame.app\r\n');
    expect(ics).toContain('LOCATION:Cra. 43A\\, Medellín');
  });

  it('escapes text and folds long lines by octets', () => {
    expect(escapeText('a;b,c\nd\\')).toBe('a\\;b\\,c\\nd\\\\');
    const folded = foldLine(`DESCRIPTION:${'á'.repeat(80)}`);
    expect(folded.split('\r\n ').every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

describe('calendar links', () => {
  const e = { title: 'Valoración', start: '2026-10-22T15:00:00.000Z', end: '2026-10-22T15:30:00.000Z', details: 'd', location: 'l' };
  it('Google template link', () => {
    const url = new URL(googleCalendarUrl(e));
    expect(url.searchParams.get('action')).toBe('TEMPLATE');
    expect(url.searchParams.get('dates')).toBe('20261022T150000Z/20261022T153000Z');
  });
  it('Outlook deeplink', () => {
    const url = new URL(outlookCalendarUrl(e));
    expect(url.searchParams.get('rru')).toBe('addevent');
    expect(url.searchParams.get('startdt')).toBe('2026-10-22T15:00:00.000Z');
  });
});
