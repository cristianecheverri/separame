import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';
import { delta, periodRange } from '../features/stats/periods';
import { deviceLabel, urlBase64ToUint8Array } from '../lib/push';

describe('attendance', () => {
  it('shows client confirmation on upcoming appointments', async () => {
    await renderApp('/');
    await screen.findByText('Carlos Mejía');
    expect(screen.getAllByText('Confirmó asistencia').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sin respuesta').length).toBeGreaterThan(0);
  });

  it('marks a started appointment and lets you undo', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const group = await screen.findByRole('group', { name: 'Asistencia de Juan Esteban Ruiz' });
    await user.click(within(group).getByRole('button', { name: /No asistió/ }));
    expect(await screen.findByText('Marcaste que Juan Esteban Ruiz no asistió.')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Asistencia de Juan Esteban Ruiz' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('group', { name: 'Asistencia de Juan Esteban Ruiz' })).toBeInTheDocument();
  });

  it('lets you change a marked outcome', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Cambiar asistencia de Mariana Gómez' }));
    expect(screen.getByRole('group', { name: 'Asistencia de Mariana Gómez' })).toBeInTheDocument();
  });
});

describe('clients', () => {
  it('lists clients and opens the detail with notes and the Ley 1581 warning', async () => {
    const user = userEvent.setup();
    await renderApp('/clients');
    await user.click((await screen.findAllByRole('link', { name: 'Ver Ana María Salazar' }))[0]);
    expect(await screen.findByRole('heading', { level: 1, name: 'Ana María Salazar' })).toBeInTheDocument();
    expect(screen.getByText('No escribas información de salud ni datos sensibles (Ley 1581).')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', 'https://wa.me/573001356355');
    expect(screen.getByRole('link', { name: /Llamar/ })).toHaveAttribute('href', 'tel:+573001356355');
    await user.type(screen.getByLabelText('Notas sobre Ana María Salazar'), 'Prefiere la tarde.');
    await user.click(screen.getByRole('button', { name: 'Guardar notas' }));
    expect(await screen.findByText('Notas guardadas.')).toBeInTheDocument();
  });

  it('refuses to delete a client with upcoming appointments', async () => {
    const user = userEvent.setup();
    await renderApp('/clients/c-ana.maria.salazar');
    await user.click(await screen.findByRole('button', { name: 'Eliminar cliente' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Sí, eliminar' }));
    expect(await within(dialog).findByText('Tiene citas próximas. Cancélalas antes de eliminar este cliente.')).toBeInTheDocument();
  });

  it('opens "Nueva cita" with the client prefilled', async () => {
    const user = userEvent.setup();
    await renderApp('/clients/c-ana.maria.salazar');
    await user.click(await screen.findByRole('button', { name: 'Nueva cita' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
    expect(within(dialog).getByLabelText('Nombre')).toHaveValue('Ana María Salazar');
  });
});

describe('waitlist', () => {
  it('shows the waitlist on the agenda and removes entries', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    expect(await screen.findByRole('heading', { name: 'Lista de espera (4)' })).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Ver todas' }));
    expect(await screen.findByRole('button', { name: 'Lista de espera', pressed: true })).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /^Más acciones para / })[0]);
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Quitar de la lista' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Sí, quitar' }));
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Más acciones para / })).toHaveLength(3));
  });
});

describe('stats', () => {
  it('shows KPIs, charts and the unmarked nudge', async () => {
    const user = userEvent.setup();
    await renderApp('/stats');
    expect(await screen.findByText('Ingresos estimados')).toBeInTheDocument();
    expect(screen.getByText('Estimado con tus precios de referencia; Sepárame no cobra a tus clientes.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Citas por día de la semana: lunes/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Marcar ahora →' })).toHaveAttribute('href', '/appointments?tab=past&filter=unmarked');
    await user.click(screen.getByRole('button', { name: 'Este año' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Este año' })).toHaveAttribute('aria-pressed', 'true'));
  });

  it('computes periods and deltas', () => {
    expect(periodRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('month', '2026-02-10')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(periodRange('last90', '2026-10-20').from).toBe('2026-07-23');
    expect(delta(66, 41, 'count')).toEqual({ text: '+61 %', direction: 1 });
    expect(delta(0.1, 0.15, 'ratio')).toEqual({ text: '-5 pts', direction: -1 });
    expect(delta(3, 0, 'count')).toBeNull();
  });
});

describe('web push', () => {
  it('enables notices on this device, tests and disables them', async () => {
    const user = userEvent.setup();
    await renderApp('/calendar-sync');
    const toggle = await screen.findByRole('button', { name: 'Avisos en este celular' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    expect(await screen.findByText('Listo: te avisaremos en este celular.')).toBeInTheDocument();
    expect(await screen.findByText('Este celular')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Probar aviso/ }));
    expect(await screen.findByText('Te enviamos un aviso de prueba.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Desactivar en este celular' }));
    expect(await screen.findByText('Desactivaste los avisos en este celular.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Este celular')).not.toBeInTheDocument());
  });

  it('labels devices and decodes VAPID keys', () => {
    expect(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('iPhone · Safari');
    expect(deviceLabel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36')).toBe('Android · Chrome');
    expect(Array.from(urlBase64ToUint8Array('AQID_-8'))).toEqual([1, 2, 3, 255, 239]);
  });
});
