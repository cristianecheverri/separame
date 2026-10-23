import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { describe, expect, it, vi } from 'vitest';
import { MOCK_TEAM } from '../mock/fixtures';
import { createMockApi } from '../mock/mockApi';
import { BookingApp } from './BookingApp';

function renderTeam(query = '') {
  const api = createMockApi(new URLSearchParams(`delay=0&${query}`));
  const createBooking = vi.spyOn(api, 'createBooking');
  const { unmount } = render(<BookingApp slug={MOCK_TEAM.slug} initialProfile={null} team={MOCK_TEAM} runtime={{ api, turnstileSiteKey: null }} />);
  return { createBooking, unmount };
}

const click = (target: string | RegExp | HTMLElement) =>
  fireEvent.click(target instanceof HTMLElement ? target : screen.getByRole('button', { name: target }));
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

async function fillDetails() {
  fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
  fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
  fireEvent.click(screen.getByRole('checkbox', { name: /Autorizo el tratamiento/ }));
  click('Siguiente');
  await screen.findByRole('heading', { name: '¿Todo bien?' });
}

describe('Team page', () => {
  it('starts with «¿Con quién?»: the team band, «Cualquiera disponible» first, then each professional', () => {
    renderTeam();
    expect(screen.getByRole('heading', { level: 1, name: 'Consultorio Sonríe' })).toBeTruthy();
    expect(screen.getByText('3 profesionales')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 5 · ¿Con quién?')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 2, name: '¿Con quién quieres tu cita?' })).toBeTruthy();
    const choices = screen.getAllByRole('button', { pressed: false }).map((b) => b.textContent);
    expect(choices.slice(0, 4)).toEqual([
      'Cualquiera disponibleTe mostramos las horas libres de todo el equipo',
      'LPDra. Laura PérezOdontóloga',
      'JODr. Julián OrtizOrtodoncista',
      'SGDra. Sara GómezEndodoncista',
    ]);
    expect(isDisabled(screen.getByRole('button', { name: 'Elige con quién' }))).toBe(true);
  });

  it('a professional continues with their own services, and the chip goes back to «¿Con quién?»', async () => {
    renderTeam();
    click(/Dr\. Julián Ortiz/);
    click('Siguiente');
    expect(screen.getByText('Paso 2 de 5 · Servicio')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '¿Qué servicio necesitas?' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Control de brackets/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Limpieza dental/ })).toBeNull();
    // The header row keeps the consultorio.
    expect(screen.getByText('Consultorio Sonríe')).toBeTruthy();
    click('Cambiar con quién: Con Dr. Julián Ortiz');
    expect(screen.getByText('Paso 1 de 5 · ¿Con quién?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Dr\. Julián Ortiz/, pressed: true })).toBeTruthy();

    // Another professional: the service starts over; "Paso anterior" steps back.
    click(/Dra\. Sara Gómez/);
    click('Siguiente');
    click(/Valoración de endodoncia/);
    click('Siguiente');
    expect(screen.getByText('Paso 3 de 5 · Día y hora')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar con quién: Con Dra. Sara Gómez' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar servicio: Valoración de endodoncia · 30 min' })).toBeTruthy();
    // A chosen professional never shows «Te atiende» under the hour.
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    expect(screen.queryByText(/Te atiende/)).toBeNull();
    click('Paso anterior');
    await screen.findByText('Paso 2 de 5 · Servicio');
  });

  it('«Cualquiera disponible» merges the services, assigns each hour and books with that professional', async () => {
    const { createBooking } = renderTeam();
    click(/Cualquiera disponible/);
    click('Siguiente');
    expect(screen.getByRole('button', { name: 'Cambiar con quién: Cualquiera disponible' }).textContent).toContain('Cambiar');
    // Dra. Laura Pérez and Dra. Sara Gómez both offer «Valoración» (30 min): one entry.
    expect(screen.getAllByRole('button', { name: /^Valoración30 min/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: /Tratamiento de conducto/ })).toBeTruthy();
    click(/^Valoración30 min/);
    click('Siguiente');
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    // 9:00 is taken for Dra. Laura Pérez but free for Dra. Sara Gómez.
    click('9:00 a. m.');
    expect(screen.getByRole('status').textContent).toBe('SGTe atiende: Dra. Sara Gómez (libre a esa hora)');
    click('10:00 a. m.');
    expect(screen.getByRole('status').textContent).toBe('LPTe atiende: Dra. Laura Pérez (libre a esa hora)');
    click('9:00 a. m.');
    click('Siguiente');
    expect(screen.getByText('Paso 4 de 5 · Tus datos')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar con quién: Con Dra. Sara Gómez' })).toBeTruthy();
    await fillDetails();
    expect(screen.getByText('Te atiende')).toBeTruthy();
    expect(screen.getByText('Endodoncista · asignado por estar libre')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cambiar con quién' })).toBeTruthy();
    expect(screen.getByText('Consultorio Sonríe · Cra. 43A #1-50, consultorio 302, El Poblado')).toBeTruthy();
    click('Separar mi cita');
    expect(await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' })).toBeTruthy();
    expect(createBooking).toHaveBeenCalledWith('dra-sara-gomez', expect.objectContaining({ serviceId: 'sg-valoracion', start: '2026-10-22T14:00:00.000Z' }));
    expect(screen.getByText('Dra. Sara Gómez')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a la agenda' }).getAttribute('href')).toBe('/consultorio-sonrie');
  });

  it('restores the «¿Con quién?» choice after a reload', async () => {
    const first = renderTeam();
    click(/Dra\. Laura Pérez/);
    click('Siguiente');
    click(/Limpieza dental/);
    click('Siguiente');
    await screen.findByRole('button', { name: 'Jueves 22 de octubre' });
    first.unmount();
    renderTeam();
    await waitFor(() => expect(screen.getByText('Paso 3 de 5 · Día y hora')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Cambiar con quién: Con Dra. Laura Pérez' })).toBeTruthy();
  });

  it('shows «Agenda no disponible» for the consultorio when the plan expired', async () => {
    renderTeam('state=unavailable');
    expect(await screen.findByText('Agenda no disponible temporalmente')).toBeTruthy();
    expect(screen.getByText(/no se pueden separar citas en línea con Consultorio Sonríe\./)).toBeTruthy();
  });
});

describe('A team member’s own page', () => {
  it('shows «Parte de <consultorio>» linking to the team page, and the usual 4 steps', () => {
    const api = createMockApi(new URLSearchParams('delay=0'));
    const julian = MOCK_TEAM.members[1];
    render(<BookingApp slug={julian.slug} initialProfile={julian} runtime={{ api, turnstileSiteKey: null }} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Dr. Julián Ortiz' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Parte de Consultorio Sonríe' }).getAttribute('href')).toBe('/consultorio-sonrie');
    expect(screen.getByText('Paso 1 de 4 · Servicio')).toBeTruthy();
  });

  it('a professional without a team has no «Parte de» line', () => {
    const api = createMockApi(new URLSearchParams('delay=0'));
    const { team: _team, ...solo } = MOCK_TEAM.members[1];
    render(<BookingApp slug={solo.slug} initialProfile={solo} runtime={{ api, turnstileSiteKey: null }} />);
    expect(screen.queryByText(/Parte de/)).toBeNull();
  });
});
