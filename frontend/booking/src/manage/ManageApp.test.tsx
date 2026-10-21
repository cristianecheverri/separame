import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
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
    // The appointment's own day comes preselected; its current hour shows dashed and can't be picked.
    expect(await screen.findByRole('button', { name: 'Jueves 22 de octubre', pressed: true })).toBeTruthy();
    expect((screen.getByRole('button', { name: '10:00 a. m., tu cita actual' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('La hora con borde punteado es tu cita actual.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Elige la nueva hora' }) as HTMLButtonElement).disabled).toBe(true);
    click(screen.getByRole('button', { name: 'Lunes 26 de octubre' }));
    click('8:30 a. m.');
    click('Mover a lun 26, 8:30 a. m.');
    expect(await screen.findByRole('heading', { name: 'Listo, tu cita cambió.' })).toBeTruthy();
    expect(screen.getByText('Tu nueva cita')).toBeTruthy();
    expect(screen.getByText('Lunes 26 de octubre · 8:30 a. m.')).toBeTruthy();
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

  it('?action=confirm only highlights and focuses the button (one tap still needed) and strips the param', async () => {
    history.replaceState(null, '', '/c/demo-token?action=confirm');
    render(<ManageApp token="demo-token" api={api()} />);
    const button = await screen.findByRole('button', { name: 'Confirmar asistencia' });
    expect(location.search).toBe('');
    await waitFor(() => expect(document.activeElement).toBe(button));
    expect(button.className).toContain('ring-4');
    expect(screen.queryByText('Asistencia confirmada')).toBeNull();
    click(button);
    expect(await screen.findByRole('heading', { name: '¡Gracias, Mariana! Confirmaste tu asistencia.' })).toBeTruthy();
  });

  it('?action=confirm on an already confirmed appointment shows the thank-you screen', async () => {
    history.replaceState(null, '', '/c/confirmed?action=confirm');
    render(<ManageApp token="confirmed" api={api()} />);
    expect(await screen.findByRole('heading', { name: '¡Gracias, Mariana! Confirmaste tu asistencia.' })).toBeTruthy();
  });

  it('shows the badge when attendance was already confirmed', async () => {
    render(<ManageApp token="confirmed" api={api()} />);
    await screen.findByRole('heading', { name: /Qué quieres hacer/ });
    expect(screen.getByText('Asistencia confirmada')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Confirmar asistencia' })).toBeNull();
  });
});

describe('LeaveWaitlist', () => {
  it('asks first, then takes the client off the waitlist with one tap', async () => {
    const client = api();
    const leave = vi.spyOn(client, 'leaveWaitlist');
    render(<LeaveWaitlist token="tok" api={client} />);
    expect(screen.getByRole('heading', { name: '¿Quieres salir de la lista de espera?' })).toBeTruthy();
    expect(leave).not.toHaveBeenCalled();
    click('Sí, sácame de la lista');
    expect(await screen.findByRole('heading', { name: 'Listo, ya no estás en la lista de espera.' })).toBeTruthy();
    expect(leave).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Separar una cita con Dra. Laura Pérez' }).getAttribute('href')).toBe('/dra-laura-perez');
  });

  it('handles a bad link', async () => {
    render(<LeaveWaitlist token="invalid" api={api()} />);
    click('Sí, sácame de la lista');
    expect(await screen.findByRole('heading', { name: 'Este enlace no es válido' })).toBeTruthy();
  });
});
