import { render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import type { PublicProfile } from '@shared/api';
import { MOCK_PROFILE } from '../mock/fixtures';
import { StepService } from './StepService';

const profile: PublicProfile = {
  ...MOCK_PROFILE,
  services: [
    { id: 'a', name: 'Servicio con valor', durationMin: 30, priceCop: 60000, priceDisplay: 'fixed', description: '' },
    { id: 'b', name: 'Servicio antiguo sin precio', durationMin: 15, priceCop: null, description: '' },
    { id: 'c', name: 'Servicio sin costo', durationMin: 15, priceCop: null, priceDisplay: 'free', description: '' },
    { id: 'd', name: 'Servicio a convenir', durationMin: 15, priceCop: null, priceDisplay: 'agreed', description: '' },
    { id: 'e', name: 'Servicio sin precio visible', durationMin: 30, priceCop: null, priceDisplay: 'hidden', description: '' },
  ],
};

describe('StepService price line', () => {
  it('shows the value, "Sin costo" (also for old pages), "Precio a convenir", or nothing', () => {
    render(<StepService profile={profile} serviceId={null} onPick={() => {}} titleRef={{ current: null }} titleAs="h1" />);
    const button = (name: string) => screen.getByRole('button', { name: new RegExp(name) });
    expect(button('Servicio con valor').textContent).toContain('$60.000');
    expect(button('Servicio antiguo sin precio').textContent).toContain('Sin costo');
    expect(button('Servicio sin costo').textContent).toContain('Sin costo');
    expect(button('Servicio a convenir').textContent).toContain('Precio a convenir');
    const hidden = button('Servicio sin precio visible').textContent ?? '';
    expect(hidden).not.toMatch(/\$|Sin costo|convenir/);
  });
});
