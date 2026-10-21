import { describe, expect, it } from 'vitest';
import { clientKeyOf, NO_CLIENT_KEY } from './clients';

describe('clientKeyOf', () => {
  it('keys by phone first, so booking with and without email stays one client', () => {
    const withEmail = clientKeyOf({ email: 'mariana@correo.com', phone: '3001234567' });
    expect(withEmail).toHaveLength(24);
    expect(clientKeyOf({ email: '', phone: '+57 300 123 4567' })).toBe(withEmail);
    expect(clientKeyOf({ email: 'otro@correo.com', phone: '300 123 4567' })).toBe(withEmail);
    expect(clientKeyOf({ email: 'mariana@correo.com', phone: '3119999999' })).not.toBe(withEmail);
  });

  it('falls back to the normalized email when there is no phone', () => {
    const byEmail = clientKeyOf({ email: ' Mariana@Correo.com ', phone: '' });
    expect(byEmail).toBe(clientKeyOf({ email: 'mariana@correo.com', phone: '' }));
    expect(byEmail).not.toBe(clientKeyOf({ email: '', phone: '3001234567' }));
  });

  it('has no key without email and phone (never keys by name)', () => {
    expect(clientKeyOf({ email: '', phone: '' })).toBe(NO_CLIENT_KEY);
    expect(clientKeyOf({ email: '  ', phone: ' ' })).toBe('');
  });
});
