import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, api, errorMessage, setTransport } from './api';
import { auth } from './auth';
import type { AuthClient } from './authClient';

function client(tokens: (string | null)[]): AuthClient {
  const getIdToken = vi.fn(async () => tokens.shift() ?? null);
  return { getIdToken, signOut: vi.fn(async () => {}) } as unknown as AuthClient;
}

afterEach(() => vi.restoreAllMocks());

describe('api client', () => {
  it('sends the ID token and returns the body', async () => {
    await auth.init(client(['init', 'tok-1']));
    const transport = vi.fn(async () => ({ status: 200, body: { ok: true } }));
    setTransport(transport);
    await expect(api.get('/me')).resolves.toEqual({ ok: true });
    expect(transport).toHaveBeenCalledWith(expect.objectContaining({ method: 'GET', path: '/me', token: 'tok-1' }));
  });

  it('refreshes once on 401 and retries', async () => {
    await auth.init(client(['init', 'old', 'new', 'new']));
    const transport = vi.fn().mockResolvedValueOnce({ status: 401, body: null }).mockResolvedValueOnce({ status: 200, body: { ok: 1 } });
    setTransport(transport);
    await expect(api.get('/me')).resolves.toEqual({ ok: 1 });
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it('signs out when the refresh fails', async () => {
    await auth.init(client(['init', 'old', null]));
    setTransport(vi.fn(async () => ({ status: 401, body: null })));
    await expect(api.get('/me')).rejects.toBeInstanceOf(ApiError);
    expect(auth.getState().status).toBe('signedOut');
  });

  it('maps API error codes to Spanish', async () => {
    await auth.init(client(['init', 't']));
    setTransport(async () => ({ status: 409, body: { error: { code: 'slot_taken', message: 'x' } } }));
    const error = await api.post('/me/appointments', {}).catch((e) => e);
    expect(error).toMatchObject({ status: 409, code: 'slot_taken' });
    expect(errorMessage(error)).toBe('Ese horario se acaba de ocupar. Elige otro.');
  });

  it('sends the team acting header only for a member (per-call override)', async () => {
    await auth.init(client(['init', 't', 't', 't']));
    const transport = vi.fn(async () => ({ status: 200, body: {} }));
    setTransport(transport);
    await api.get('/me/services', { actingProId: 'pro-julian' });
    await api.get('/me/services', { actingProId: null });
    await api.get('/me/services');
    expect(transport.mock.calls.map((c) => (c as unknown as [{ headers?: Record<string, string> }])[0].headers)).toEqual([{ 'x-separame-pro': 'pro-julian' }, undefined, undefined]);
  });
});
