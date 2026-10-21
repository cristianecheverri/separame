import { describe, expect, it } from 'vitest';
import { CONTACT_MESSAGES } from '../../shared/contact';
import { createBookingSchema } from '../../shared/schemas';
import { apiEvent, parse, setTestEnv } from '../testing/fixtures';
import { ApiError, createApiHandler, ok, parseBody } from './http';

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
