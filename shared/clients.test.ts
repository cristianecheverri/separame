import { describe, expect, it } from 'vitest';
import { clientKeyOf } from './clients';

describe('clientKeyOf', () => {
  it('is stable across email casing/spaces and falls back to the phone', () => {
    const a = clientKeyOf({ email: ' Mariana@Correo.com ', phone: '3001234567' });
    expect(a).toBe(clientKeyOf({ email: 'mariana@correo.com', phone: '3119999999' }));
    expect(a).toHaveLength(24);
    const byPhone = clientKeyOf({ email: '', phone: '+57 300 123 4567' });
    expect(byPhone).toBe(clientKeyOf({ email: '', phone: '3001234567' }));
    expect(byPhone).not.toBe(a);
  });
});
