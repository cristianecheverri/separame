import { fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockApi } from '../mock/mockApi';
import { LeaveWaitlist } from './LeaveWaitlist';
import { ManageApp } from './ManageApp';

const api = () => createMockApi(new URLSearchParams('delay=0'));
const click = (target: string | RegExp | HTMLElement) =>
  fireEvent.click(target instanceof HTMLElement ? target : screen.getByRole('button', { name: target }));

describe('ManageApp', () => {
  // The mock appointments are dated around Tue 20 Oct 2026; pin the clock there so the
  // "too late" vs "already past" logic doesn't depend on the day the tests run.
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T14:25:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('cancels with an optional reason', async () => {
    render(<ManageApp token="demo-token" api={api()} />);
    await screen.findByRole('heading', { name: 'Hola, Mariana. ¿Qué quieres hacer con tu cita?' });
    click(/Cancelar la cita/);
    expect(screen.getByText(/cuéntale a Dra\. Laura Pérez por qué/)).toBeTruthy();
    fireEvent.input(screen.getByLabelText('Motivo (opcional)'), { target: { value: 'Me salió un viaje' } });
    click('Sí, cancelar la cita');
    expect(await screen.findByRole('heading', { name: 'Tu cita quedó cancelada.' })).toBeTruthy();
    expect(screen.getByText('Cita cancelada')).toBeTruthy();
  });

  it('moves the appointment to a new slot', async () => {
    render(<ManageApp token="demo-token" api={api()} />);
    click(await screen.findByRole('button', { name: /Cambiar día u hora/ }));
    click(await screen.findByRole('button', { name: 'Viernes 23 de octubre' }));
    click('8:30 a. m.');
    click('Mover a vie 23, 8:30 a. m.');
    expect(await screen.findByRole('heading', { name: 'Listo, tu cita cambió.' })).toBeTruthy();
    expect(screen.getByText('Tu nueva cita')).toBeTruthy();
    expect(screen.getByText('Viernes 23 de octubre · 8:30 a. m.')).toBeTruthy();
  });

  it('explains when it is too late or already cancelled', async () => {
    const view = render(<ManageApp token="late" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Ya no se puede cambiar en línea' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Llamar al consultorio/ }).getAttribute('href')).toBe('tel:+576044441234');
    view.unmount();
    render(<ManageApp token="cancelled" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Esta cita ya está cancelada' })).toBeTruthy();
  });

  it('handles a bad link', async () => {
    render(<ManageApp token="invalid" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeTruthy();
  });

  it('confirms attendance from the menu and shows the badge', async () => {
    render(<ManageApp token="demo-token" api={api()} />);
    click(await screen.findByRole('button', { name: 'Confirmar asistencia' }));
    expect(await screen.findByRole('heading', { name: '¡Gracias, Mariana! Confirmaste tu asistencia.' })).toBeTruthy();
    expect(screen.getByText('Asistencia confirmada')).toBeTruthy();
    click('Ver opciones de mi cita');
    expect(screen.queryByRole('button', { name: 'Confirmar asistencia' })).toBeNull();
  });

  it('confirms automatically with ?action=confirm and strips the param', async () => {
    history.replaceState(null, '', '/c/demo-token?action=confirm');
    render(<ManageApp token="demo-token" api={api()} />);
    expect(await screen.findByRole('heading', { name: '¡Gracias, Mariana! Confirmaste tu asistencia.' })).toBeTruthy();
    expect(location.search).toBe('');
  });

  it('shows the badge when attendance was already confirmed', async () => {
    render(<ManageApp token="confirmed" api={api()} />);
    await screen.findByRole('heading', { name: /Qué quieres hacer/ });
    expect(screen.getByText('Asistencia confirmada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar asistencia' })).toBeNull();
  });
});

describe('LeaveWaitlist', () => {
  it('takes the client off the waitlist', async () => {
    render(<LeaveWaitlist token="tok" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Listo, ya no estás en la lista de espera.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Separar una cita con Dra. Laura Pérez' }).getAttribute('href')).toBe('/dra-laura-perez');
  });

  it('handles a bad link', async () => {
    render(<LeaveWaitlist token="invalid" api={api()} />);
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeTruthy();
  });
});
