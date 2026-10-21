import { describe, expect, it } from 'vitest';
import { apiEvent } from '../testing/fixtures';
import { parseGroups, requireAdmin, requireUser } from './auth';
import { ApiError } from './http';

describe('parseGroups', () => {
  it.each([
    ['[admin]', ['admin']],
    ['[admin pros]', ['admin', 'pros']],
    ['admin', ['admin']],
    ['admin,pros', ['admin', 'pros']],
    ['["admin","pros"]', ['admin', 'pros']],
    [['admin'], ['admin']],
    ['', []],
    ['[]', []],
    [undefined, []],
  ])('%j → %j', (raw, expected) => {
    expect(parseGroups(raw)).toEqual(expected);
  });
});

describe('requireUser / requireAdmin', () => {
  it('reads sub, lowercased email and admin flag from the JWT claims', () => {
    const user = requireUser(apiEvent('GET /me', { claims: { sub: 'u1', email: 'Laura@Correo.COM', 'cognito:groups': '[admin]' } }));
    expect(user).toEqual({ sub: 'u1', email: 'laura@correo.com', groups: ['admin'], isAdmin: true });
  });

  it('rejects missing claims with unauthorized', () => {
    expect(() => requireUser(apiEvent('GET /me'))).toThrow(ApiError);
    try {
      requireUser(apiEvent('GET /me'));
    } catch (err) {
      expect((err as ApiError).code).toBe('unauthorized');
    }
  });

  it('requires the admin group', () => {
    const event = apiEvent('GET /admin/stats', { claims: { sub: 'u1', email: 'a@b.co', 'cognito:groups': 'pros' } });
    expect(() => requireAdmin(event)).toThrow(expect.objectContaining({ code: 'forbidden' }));
  });
});
