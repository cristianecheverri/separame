import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderApp } from '../test/renderApp';
import { matchClients } from '../features/appointments/ClientNameField';
import { formatTimeRange } from '../features/appointments/slotFormat';
import { tabOf } from '../components/layout/TabBar';
import type { ClientRecord } from '@shared/types';

describe('tab bar (MP-01)', () => {
  it('maps routes to tabs', () => {
    expect(tabOf('/')).toBe('agenda');
    expect(tabOf('/appointments')).toBe('appointments');
    expect(tabOf('/clients/c-1')).toBe('clients');
    expect(tabOf('/services')).toBe('more');
    expect(tabOf('/billing')).toBe('more');
  });

  it('opens "Más" with the rest of the menu and the plan card, and closes it on navigation', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' });
    expect(within(nav).getByRole('link', { name: 'Agenda' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('button', { name: 'Abrir menú' })).not.toBeInTheDocument();
    await user.click(within(nav).getByRole('button', { name: 'Más' }));
    const sheet = await screen.findByRole('dialog', { name: 'Más opciones' });
    expect(within(sheet).queryByRole('link', { name: 'Citas' })).not.toBeInTheDocument();
    expect(within(sheet).getByText('Te quedan 5 días')).toBeInTheDocument();
    await user.click(within(sheet).getByRole('link', { name: 'Servicios' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Más opciones' })).not.toBeInTheDocument());
    await waitFor(() => expect(within(nav).getByRole('button', { name: 'Más' })).toHaveAttribute('aria-current', 'page'));
  });
});

describe('new appointment with client suggestions (MP-05)', () => {
  const record = (name: string, phone: string, appointments: number): ClientRecord => ({
    key: name, name, email: '', phone, firstSeenAt: '2026-01-01T00:00:00.000Z', lastAppointmentAt: null, nextAppointmentAt: null,
    totals: { appointments, attended: 0, noShows: 0, cancelled: 0 }, notes: '', updatedAt: '2026-01-01T00:00:00.000Z',
  });

  it('matches after 2 letters, ignoring accents, or by phone digits', () => {
    const list = [record('Ana María Salazar', '3001112233', 3), record('Pedro Londoño', '3104445566', 1)];
    expect(matchClients(list, 'a')).toEqual([]);
    expect(matchClients(list, 'mari').map((c) => c.name)).toEqual(['Ana María Salazar']);
    expect(matchClients(list, 'londono').map((c) => c.name)).toEqual(['Pedro Londoño']);
    expect(matchClients(list, '310 444').map((c) => c.name)).toEqual(['Pedro Londoño']);
  });

  it('fills name, phone and email when a client is picked', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click((await screen.findAllByRole('button', { name: 'Nueva cita' }))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
    const name = within(dialog).getByRole('combobox', { name: 'Nombre' });
    await user.type(name, 'Ana M');
    const option = await within(dialog).findByRole('option', { name: /Ana María Salazar/ });
    await user.click(option);
    expect(name).toHaveValue('Ana María Salazar');
    expect(within(dialog).getByLabelText('Celular (opcional)')).not.toHaveValue('');
    expect(within(dialog).getByLabelText('Correo (opcional)')).not.toHaveValue('');
    expect(within(dialog).getByText(/ · \d+ citas?/)).toBeInTheDocument();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Quitar cliente' }));
    expect(name).toHaveValue('');
    expect(within(dialog).getByLabelText('Correo (opcional)')).toHaveValue('');
  });

  it('formats the preselected time range', () => {
    expect(formatTimeRange('2026-10-20T14:30:00.000Z', '2026-10-20T15:00:00.000Z')).toBe('9:30 – 10:00 a. m.');
    expect(formatTimeRange('2026-10-20T16:30:00.000Z', '2026-10-20T17:30:00.000Z')).toBe('11:30 a. m. – 12:30 p. m.');
  });
});

describe('actionable waitlist (MP-06)', () => {
  it('«Agendar» opens Nueva cita with the client and service', async () => {
    const user = userEvent.setup();
    await renderApp('/appointments?tab=waitlist');
    await user.click(await screen.findByRole('button', { name: 'Agendar una cita a Paula Restrepo' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
    expect(within(dialog).getByRole('combobox', { name: 'Nombre' })).toHaveValue('Paula Restrepo');
    expect(within(dialog).getByLabelText('Correo (opcional)')).toHaveValue('paula.restrepo@correo.co');
    expect(within(dialog).getByRole('button', { name: /Limpieza dental/, pressed: true })).toBeInTheDocument();
    expect(within(dialog).queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('the ⋯ menu only offers the contact options it has data for', async () => {
    const user = userEvent.setup();
    await renderApp('/appointments?tab=waitlist');
    await user.click(await screen.findByRole('button', { name: 'Más acciones para Lina Marcela Ruiz' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: 'Llamar' })).toHaveAttribute('href', 'tel:+573102233445');
    expect(within(menu).getByRole('menuitem', { name: 'WhatsApp' })).toBeInTheDocument();
    expect(within(menu).queryByRole('menuitem', { name: 'Correo' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });
});

describe('share my link (MP-07)', () => {
  afterEach(() => {
    Reflect.deleteProperty(navigator, 'share');
  });

  it('opens the native share sheet when there is one', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Compartir mi enlace' }));
    expect(share).toHaveBeenCalledWith({ title: 'Separa tu cita conmigo', text: 'Separa tu cita conmigo', url: expect.stringMatching(/\/dra-laura-perez$/) });
  });

  it('copies the link when there is no share sheet', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Copiar mi enlace' }));
    expect(await screen.findByText('Enlace copiado. Pégalo donde quieras.')).toBeInTheDocument();
  });
});
