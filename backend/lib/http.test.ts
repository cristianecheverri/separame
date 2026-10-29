import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { CONTACT_MESSAGES } from '../../shared/contact';
import { createBookingSchema } from '../../shared/schemas';
import { apiEvent, parse, setTestEnv } from '../testing/fixtures';
import { ApiError, compressed, createApiHandler, ok, parseBody, type ApiEvent } from './http';

setTestEnv();

describe('createApiHandler', () => {
  const handler = createApiHandler({
    'GET /ping': async () => ok({ pong: true }),
    'POST /bookings': async (event) => ok(parseBody(event, createBookingSchema)),
    'GET /boom': async () => {
      throw new Error('secret internals');
    },
    'GET /forbidden': async () => {
      throw new ApiError('forbidden');
    },
  });

  it('dispatches on routeKey', async () => {
    const res = await handler(apiEvent('GET /ping'));
    expect(res.statusCode).toBe(200);
    expect(parse(res)).toEqual({ pong: true });
  });

  it('returns 404 for unknown routes', async () => {
    const res = await handler(apiEvent('GET /nope'));
    expect(res.statusCode).toBe(404);
    expect(parse(res).error.code).toBe('not_found');
  });

  it('maps zod failures to a validation error with per-field messages', async () => {
    const res = await handler(apiEvent('POST /bookings', {
      body: { serviceId: 's', start: 'mañana', client: { name: 'M', email: 'no', phone: '123' }, consent: false, turnstileToken: 't' },
    }));
    expect(res.statusCode).toBe(400);
    const { error } = parse(res);
    expect(error.code).toBe('validation');
    expect(error.message).toBe('Revisa los datos marcados.');
    expect(error.fields).toMatchObject({
      start: 'Fecha y hora inválidas',
      'client.name': 'El nombre es muy corto',
      'client.email': CONTACT_MESSAGES.email,
      'client.phone': CONTACT_MESSAGES.phone,
      consent: 'Debes autorizar el tratamiento de tus datos',
    });
  });

  it('rejects malformed JSON as validation', async () => {
    const res = await handler(apiEvent('POST /bookings', { body: '{nope' }));
    expect(res.statusCode).toBe(400);
    expect(parse(res).error.fields._).toBeDefined();
  });

  it('maps ApiError codes to statuses and hides unexpected errors', async () => {
    expect((await handler(apiEvent('GET /forbidden'))).statusCode).toBe(403);
    const res = await handler(apiEvent('GET /boom'));
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('secret internals');
    expect(parse(res).error.code).toBe('internal');
  });
});

describe('compressed', () => {
  const big = { statusCode: 200, headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify({ slots: Array.from({ length: 200 }, (_, i) => `2026-10-22T${String(i % 24).padStart(2, '0')}:00:00.000Z`) }) };
  const withEncoding = (value?: string) => ({ headers: value ? { 'accept-encoding': value } : {} }) as unknown as ApiEvent;

  it('brotli when accepted, gzip otherwise; the body round-trips', () => {
    const br = compressed(withEncoding('gzip, deflate, br'), big);
    expect(br).toMatchObject({ isBase64Encoded: true, headers: { 'content-encoding': 'br', vary: 'accept-encoding' } });
    expect(brotliDecompressSync(Buffer.from(br.body!, 'base64')).toString()).toBe(big.body);
    expect(Buffer.from(br.body!, 'base64').length).toBeLessThan(big.body.length / 3);
    const gz = compressed(withEncoding('gzip'), big);
    expect(gz.headers).toMatchObject({ 'content-encoding': 'gzip' });
    expect(gunzipSync(Buffer.from(gz.body!, 'base64')).toString()).toBe(big.body);
  });

  it('leaves small bodies, empty responses and clients without compression alone', () => {
    expect(compressed(withEncoding('br'), { statusCode: 200, body: '{"ok":true}' })).toEqual({ statusCode: 200, body: '{"ok":true}' });
    expect(compressed(withEncoding('br'), { statusCode: 204 })).toEqual({ statusCode: 204 });
    expect(compressed(withEncoding(), big)).toBe(big);
  });
});
