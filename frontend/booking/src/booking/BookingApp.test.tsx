import { fireEvent, render, screen } from '@testing-library/preact';
import { describe, expect, it } from 'vitest';
import { MOCK_PROFILE } from '../mock/fixtures';
import { createMockApi } from '../mock/mockApi';
import { BookingApp } from './BookingApp';

function renderApp(query = '') {
  const api = createMockApi(new URLSearchParams(`delay=0&${query}`));
  return render(<BookingApp slug={MOCK_PROFILE.slug} initialProfile={MOCK_PROFILE} runtime={{ api, turnstileSiteKey: null }} />);
}

const click = (target: string | RegExp | HTMLElement) =>
  fireEvent.click(target instanceof HTMLElement ? target : screen.getByRole('button', { name: target }));
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled;

async function goToReview() {
  expect(isDisabled(screen.getByRole('button', { name: 'Elige un servicio' }))).toBe(true);
  click(/Valoración/);
  click('Siguiente');
  click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
  click('10:00 a. m.');
  expect(screen.getByText('Valoración · 30 min')).toBeTruthy();
  click('Siguiente');
  fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'Mariana Gómez' } });
  fireEvent.input(screen.getByLabelText('Correo'), { target: { value: 'mariana@correo.com' } });
  fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300 123 4567' } });
  fireEvent.click(screen.getByRole('checkbox'));
  click('Siguiente');
  await screen.findByRole('heading', { name: '¿Todo bien?' });
}

describe('BookingApp', () => {
  it('renders the profile instantly and books through the four steps', async () => {
    renderApp();
    expect(screen.getByText('Dra. Laura Pérez')).toBeTruthy();
    expect(screen.getByText('Paso 1 de 4 · Servicio')).toBeTruthy();
    await goToReview();
    expect(screen.getByText('Jueves 22 de octubre')).toBeTruthy();
    // The phone is glued with non-breaking spaces so it never wraps mid-number.
    const contact = screen.getByText((_, el) => el?.tagName === 'SPAN' && /^mariana@correo\.com · \+57/.test(el.textContent ?? ''));
    expect(contact.textContent).toBe('mariana@correo.com · +57\u00a0300\u00a0123\u00a04567');
    click('Separar mi cita');
    expect(await screen.findByRole('heading', { name: '¡Listo, Mariana! Tu cita quedó separada.' })).toBeTruthy();
    expect(screen.getByText('Jueves 22 de octubre · 10:00 a. m.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cancelar o reprogramar' }).getAttribute('href')).toMatch(/^\/c\/mock-/);
  });

  it('disables closed days and full days', async () => {
    renderApp();
    click(/Valoración/);
    click('Siguiente');
    expect(isDisabled(await screen.findByRole('button', { name: 'Domingo 25 de octubre, sin horas libres' }))).toBe(true);
    expect(isDisabled(screen.getByRole('button', { name: 'Martes 20 de octubre, sin horas libres' }))).toBe(true);
    expect(screen.getByText('Elige un día para ver las horas libres.')).toBeTruthy();
    click('Semana siguiente');
    expect(isDisabled(screen.getByRole('button', { name: 'Lunes 2 de noviembre, festivo' }))).toBe(true);
    expect(screen.getByText('Lun 2 es festivo (Todos los Santos).')).toBeTruthy();
  });

  it('shows field errors in Spanish and stays on step 3', async () => {
    renderApp();
    click(/Valoración/);
    click('Siguiente');
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    click('Siguiente');
    fireEvent.input(screen.getByLabelText('Nombre completo'), { target: { value: 'M' } });
    fireEvent.input(screen.getByLabelText('Correo'), { target: { value: 'mariana@' } });
    fireEvent.input(screen.getByLabelText('Celular'), { target: { value: '300' } });
    fireEvent.click(screen.getByRole('checkbox'));
    click('Siguiente');
    expect(screen.getByText('Escribe tu nombre completo')).toBeTruthy();
    expect(screen.getByText('Revisa tu correo, parece que le falta algo')).toBeTruthy();
    expect(screen.getByText('El celular debe tener 10 dígitos')).toBeTruthy();
    expect(screen.getByText('Paso 3 de 4 · Tus datos')).toBeTruthy();
  });

  it('sends the client back to step 2 when the slot was taken', async () => {
    renderApp('fail=slot_taken');
    await goToReview();
    click('Separar mi cita');
    expect(await screen.findByText('Alguien acaba de separar esa hora. Elige otra, por favor.')).toBeTruthy();
    expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
    await screen.findByRole('button', { name: '10:30 a. m.' });
    expect(screen.queryByRole('button', { name: '10:00 a. m.' })).toBeNull();
  });

  it('shows a retry message on network errors', async () => {
    renderApp('fail=network');
    await goToReview();
    click('Separar mi cita');
    expect(await screen.findByText('No pudimos conectarnos. Revisa tu internet e inténtalo de nuevo.')).toBeTruthy();
  });

  it('shows the unavailable screen when the subscription expired', async () => {
    renderApp('state=unavailable');
    expect(await screen.findByText('Agenda no disponible temporalmente')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar · 604 444 1234/ }).getAttribute('href')).toBe('tel:+576044441234');
    expect(screen.getByText(/no se pueden separar citas en línea con Dra\. Laura Pérez\./)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/pag/i);
  });

  it('restores a half-filled form after a reload', async () => {
    const first = renderApp();
    click(/Valoración/);
    click('Siguiente');
    click(await screen.findByRole('button', { name: 'Jueves 22 de octubre' }));
    click('10:00 a. m.');
    first.unmount();
    renderApp();
    expect(screen.getByText('Paso 2 de 4 · Día y hora')).toBeTruthy();
    expect(await screen.findByRole('button', { name: '10:00 a. m.', pressed: true })).toBeTruthy();
  });
});
