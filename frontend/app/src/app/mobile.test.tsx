import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { toInstant } from '@shared/time';
import type { Appointment } from '@shared/types';
import { AppointmentCard } from '../features/appointments/AppointmentCard';
import { timeStepsWith, TIME_STEPS } from '../features/availability/scheduleModel';
import { durationProblem } from '../features/services/durations';
import { renderApp } from '../test/renderApp';

async function openNewAppointment(user: ReturnType<typeof userEvent.setup>) {
  await user.click((await screen.findAllByRole('button', { name: 'Nueva cita' }))[0]);
  return screen.findByRole('dialog', { name: 'Nueva cita' });
}

describe('new appointment sheet', () => {
  it('books with the name only and words the toast mid-sentence', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openNewAppointment(user);
    expect(within(dialog).getByLabelText('Celular (opcional)')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Correo (opcional)')).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('button', { name: /Valoración/ }));
    await user.click((await within(dialog).findAllByRole('button', { name: /p\. m\./, pressed: false }))[0]);
    await user.type(within(dialog).getByLabelText('Nombre'), 'Rosa Elena');
    await user.click(within(dialog).getByRole('button', { name: 'Agendar cita' }));
    const toast = await screen.findByText(/^Cita agendada: Rosa Elena, [a-zé]+ \d+ de [a-z]+ · \d+:\d+ (a|p)\. m\.$/);
    expect(toast.textContent).not.toMatch(/\.\.$/);
  });

  it('focuses the first field with an error', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    const dialog = await openNewAppointment(user);
    await user.click(await within(dialog).findByRole('button', { name: /Valoración/ }));
    await user.click((await within(dialog).findAllByRole('button', { name: /p\. m\./, pressed: false }))[0]);
    await user.type(within(dialog).getByLabelText('Celular (opcional)'), '12');
    await user.click(within(dialog).getByRole('button', { name: 'Agendar cita' }));
    const name = within(dialog).getByLabelText('Nombre');
    expect(name).toHaveAttribute('aria-invalid', 'true');
    expect(within(dialog).getByLabelText('Celular (opcional)')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(name).toHaveFocus());
  });

  it('keeps the tapped free time when a service is chosen', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: /^Espacio libre a las 9:30/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva cita' });
    await user.click(within(dialog).getByRole('button', { name: /Control/ }));
    expect(await within(dialog).findByText(/^9:30 – 9:45 a\. m\. · del espacio libre$/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cambiar' }));
    expect(await within(dialog).findByRole('button', { name: '9:30 a. m.', pressed: true })).toBeInTheDocument();
  });
});

describe('clients without contact data', () => {
  const base: Appointment = {
    id: 'apt-x', proId: 'pro-1', serviceId: 'svc-control', serviceName: 'Control', durationMin: 15, priceCop: null,
    start: toInstant('2026-10-21', '17:00'), end: toInstant('2026-10-21', '17:15'), status: 'confirmed',
    client: { name: 'Rosa Elena Pérez', email: '', phone: '' }, createdBy: 'pro', createdAt: '2026-10-20T12:00:00.000Z',
    updatedAt: '2026-10-20T12:00:00.000Z', clientConfirmation: 'pending', revision: 0, clientKey: '',
  };

  it('renders a card without "Sin confirmar" when nobody could be asked', () => {
    render(<AppointmentCard row={{ key: base.id, kind: 'confirmed', start: base.start, time: '5:00 p. m.', appointment: base }} now={new Date('2026-10-20T14:25:00.000Z')} />);
    expect(screen.getByText('Rosa Elena Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Sin confirmar')).not.toBeInTheDocument();
  });

  it('tells the pro to call a client who left no email', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Cancelar cita de Tomás Rendón' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la cita de Tomás Rendón?' });
    expect(within(dialog).getByText(/Este cliente no dejó correo: llámalo al/)).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /^\+57 / })).toHaveAttribute('href', expect.stringMatching(/^tel:\+57\d{10}$/));
    expect(within(dialog).queryByText(/Le enviamos un correo/)).not.toBeInTheDocument();
  });
});

describe('phone fixes', () => {
  it('shows the plan strip on phones during the grace period', async () => {
    await renderApp('/', { state: 'grace' });
    expect(await screen.findByRole('link', { name: 'Renueva antes del 21 oct. Renovar' })).toHaveAttribute('href', '/billing');
  });

  it('undoes removing a blocked period', async () => {
    const user = userEvent.setup();
    await renderApp('/availability');
    await user.click(await screen.findByRole('button', { name: 'Quitar bloqueo «Vacaciones»' }));
    expect(await screen.findByText('Quitaste «Vacaciones». Ya se puede reservar en esas fechas.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Quitar bloqueo «Vacaciones»' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(await screen.findByRole('button', { name: 'Quitar bloqueo «Vacaciones»' })).toBeInTheDocument();
  });

  it('opens an appointment of the week view in its day', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Semana' }));
    await user.click((await screen.findAllByRole('button', { name: /^Rosa Elena Pérez, 5:00 p\. m\./ }))[0]);
    expect(await screen.findByRole('heading', { name: /Agenda de mañana$/ })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Mover cita de Rosa Elena Pérez' })).toBeInTheDocument();
  });

  it('lets a service have any duration from 5 to 480 minutes', async () => {
    const user = userEvent.setup();
    await renderApp('/services');
    await user.click(await screen.findByRole('button', { name: 'Otra' }));
    const minutes = screen.getByLabelText('Duración en minutos');
    await user.type(minutes, '75');
    expect(minutes).toHaveValue('75');
    expect(durationProblem(75)).toBeNull();
    expect(durationProblem(7)).toBe('La duración va en múltiplos de 5 minutos.');
    expect(durationProblem(500)).toMatch(/de 5 a 480 minutos/);
    expect(durationProblem(Number.NaN)).toBe('Escribe la duración en minutos.');
  });

  it('offers 15-minute times from 5 a. m. to 11 p. m., keeping odd saved values', () => {
    expect(TIME_STEPS[0]).toBe('05:00');
    expect(TIME_STEPS.at(-1)).toBe('23:00');
    expect(TIME_STEPS).toHaveLength(73);
    expect(timeStepsWith('08:00')).toBe(TIME_STEPS);
    expect(timeStepsWith('06:10')).toContain('06:10');
    expect(timeStepsWith('23:30').at(-1)).toBe('23:30');
  });
});
