import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTING_PRO_HEADER, type MeResponse } from '@shared/api';
import { ALL_PROS, actingFrom, actingHeaderFor, resolveSelection } from '../../lib/actingPro';
import { setTransport, type TransportRequest } from '../../lib/api';
import { session } from '../../lib/storage';
import { mockTransport } from '../../mocks/mockApi';
import { renderApp } from '../../test/renderApp';
import { suggestedAmount } from '../admin/priceText';
import { scheduleSummary, seatsText } from './teamText';

afterEach(() => vi.restoreAllMocks());

/** Records every request the app sends (still answered by the mock API). */
function spyTransport(): TransportRequest[] {
  const calls: TransportRequest[] = [];
  setTransport((req) => {
    calls.push(req);
    return mockTransport(req, 0);
  });
  return calls;
}

const headerOf = (req: TransportRequest) => req.headers?.[ACTING_PRO_HEADER] ?? null;
/** jsdom renders both selectors (phone bar and desktop chips): the first one is enough. */
const selector = async () => (await screen.findAllByRole('group', { name: 'Profesional' }))[0];
const pick = async (user: ReturnType<typeof userEvent.setup>, name: string) => user.click(within(await selector()).getByRole('button', { name }));

describe('acting professional (unit)', () => {
  const me = {
    profile: { id: 'owner' },
    team: { members: [{ proId: 'owner', isOwner: true }, { proId: 'm1', isOwner: false }] },
  } as unknown as MeResponse;

  it('falls back to the owner when the stored id left the team, and «Todos» needs a team', () => {
    expect(resolveSelection('m1', 'owner', ['owner', 'm1'])).toBe('m1');
    expect(resolveSelection('gone', 'owner', ['owner', 'm1'])).toBe('owner');
    expect(resolveSelection(null, 'owner', ['owner', 'm1'])).toBe('owner');
    expect(resolveSelection(ALL_PROS, 'owner', ['owner', 'm1'])).toBe(ALL_PROS);
    expect(resolveSelection(ALL_PROS, 'owner', [])).toBe('owner');
  });

  it('sends no header for the owner; «Todos» acts on the owner unless a scope picks a member', () => {
    expect(actingHeaderFor('owner', 'owner')).toBeNull();
    expect(actingHeaderFor('m1', 'owner')).toBe('m1');
    expect(actingFrom(me, ALL_PROS, null)).toMatchObject({ isAll: true, proId: 'owner', header: null });
    expect(actingFrom(me, ALL_PROS, 'm1')).toMatchObject({ isAll: false, proId: 'm1', header: 'm1' });
    expect(actingFrom(me, 'm1', null)).toMatchObject({ selection: 'm1', proId: 'm1', header: 'm1' });
  });
});

describe('team text', () => {
  it('summarizes seats and schedules', () => {
    expect(seatsText({ seats: 2, members: [{}, {}, {}] as never })).toBe('2 de 2 cupos adicionales usados');
    expect(seatsText({ seats: 1, members: [{}] as never })).toBe('0 de 1 cupo adicional usado');
    const day = [{ start: '08:00', end: '17:00' }];
    expect(scheduleSummary({ mon: day, tue: day, wed: day, thu: day, fri: day, sat: [], sun: [] })).toBe('Lun a vie, 8:00 a. m. – 5:00 p. m.');
    expect(scheduleSummary({ mon: [], tue: day, wed: [], thu: day, fri: [], sat: [], sun: [] })).toBe('Mar y jue, 8:00 a. m. – 5:00 p. m.');
  });

  it('suggests the admin a manual payment that includes the team seats', () => {
    const price = { packages: [{ months: 3, amountCop: 15000 }], monthlyCop: 5000, extraProfessionalCop: 3900 } as never;
    expect(suggestedAmount(price, 3)).toBe(15000);
    expect(suggestedAmount(price, 3, 2)).toBe(15000 + 2 * 3900 * 3);
    expect(suggestedAmount(price, 1, 2)).toBe(5000 + 2 * 3900);
  });
});

describe('selector and acting header', () => {
  it('has no selector without a team', async () => {
    await renderApp('/', { team: 'none' });
    await screen.findByRole('heading', { name: /Agenda de hoy/ });
    expect(screen.queryByRole('group', { name: 'Profesional' })).not.toBeInTheDocument();
  });

  it('switches Servicios to a member: sends the header, never shows the owner’s cached list', async () => {
    const user = userEvent.setup();
    await renderApp('/services', { team: 'approved' });
    const calls = spyTransport();
    expect(await screen.findAllByText('Limpieza dental')).not.toHaveLength(0);
    // No «Todos» outside Agenda and Citas.
    expect(within(await selector()).queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument();
    await pick(user, 'Julián');
    expect(await screen.findAllByText('Control de brackets')).not.toHaveLength(0);
    expect(screen.queryByText('Limpieza dental')).not.toBeInTheDocument();
    const services = calls.filter((c) => c.method === 'GET' && c.path === '/me/services');
    expect(services.map(headerOf)).toContain('pro-julian');
    expect(session.get('separame:acting-pro')).toBe('pro-julian');

    await pick(user, 'Laura (tú)');
    expect(await screen.findAllByText('Limpieza dental')).not.toHaveLength(0);
    expect(screen.queryByText('Control de brackets')).not.toBeInTheDocument();
    // The owner's own data is never requested with the header.
    expect(calls.filter((c) => c.path === '/me/services' && headerOf(c) === 'pro-laura')).toHaveLength(0);
  });

  it('agenda «Todos» merges every professional’s appointments with a tag of whose they are', async () => {
    const user = userEvent.setup();
    await renderApp('/', { team: 'approved' });
    expect(await screen.findByText('Mariana Gómez')).toBeInTheDocument();
    expect(screen.queryByText('Andrés Zapata')).not.toBeInTheDocument();
    await pick(user, 'Todos');
    expect(await screen.findByText('Andrés Zapata')).toBeInTheDocument();
    expect(screen.getByText('Camila Arango')).toBeInTheDocument();
    expect(screen.getByText('Mariana Gómez')).toBeInTheDocument();
    expect(screen.getByText('Hola, Laura. Hoy hay 11 citas en el consultorio.')).toBeInTheDocument();
    const card = screen.getByText('Andrés Zapata').closest('div[id^="appointment-"]')!;
    expect(within(card as HTMLElement).getByText('Julián')).toBeInTheDocument();
    // The link to share is the team page.
    expect(screen.getByRole('button', { name: /enlace separame\.app\/consultorio-sonrie/ })).toBeInTheDocument();

    await pick(user, 'Sara');
    expect(await screen.findByText('Sara tiene 2 citas hoy.')).toBeInTheDocument();
    expect(screen.queryByText('Mariana Gómez')).not.toBeInTheDocument();
  });

  it('under «Todos», cancelling acts on the appointment’s own professional', async () => {
    const user = userEvent.setup();
    await renderApp('/', { team: 'approved' });
    await pick(user, 'Todos');
    await screen.findByText('Felipe Montoya');
    const calls = spyTransport();
    await user.click(screen.getByRole('button', { name: 'Cancelar cita de Felipe Montoya' }));
    await user.click(await screen.findByRole('button', { name: 'Sí, cancelar cita' }));
    await waitFor(() => expect(calls.some((c) => c.path.endsWith('/cancel'))).toBe(true));
    expect(headerOf(calls.find((c) => c.path.endsWith('/cancel'))!)).toBe('pro-julian');
  });

  it('«Nueva cita» under «Todos» asks with whom, then books on that agenda', async () => {
    const user = userEvent.setup();
    await renderApp('/', { team: 'approved' });
    await pick(user, 'Todos');
    await screen.findByText('Andrés Zapata');
    await user.click(screen.getAllByRole('button', { name: 'Nueva cita' })[0]);
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('¿Con quién es la cita?')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: /Dr\. Julián Ortiz/ }));
    expect(await screen.findByRole('button', { name: /Control de brackets/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Limpieza dental/ })).not.toBeInTheDocument();
  });
});

describe('team request', () => {
  it('agenda card: ask, pending and rejected; hidden with a team', async () => {
    await renderApp('/', { team: 'none' });
    expect(await screen.findByRole('heading', { name: '¿Trabajas con más profesionales?' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Solicitar plan para equipos' })).toHaveAttribute('href', '/team/request');
  });

  it('pending card', async () => {
    await renderApp('/', { team: 'pending' });
    expect(await screen.findByRole('heading', { name: 'Solicitud en revisión' })).toBeInTheDocument();
    expect(screen.getByText('Consultorio Sonríe · 3 profesionales · enviada hoy')).toBeInTheDocument();
  });

  it('rejected card with the reason', async () => {
    await renderApp('/', { team: 'rejected' });
    expect(await screen.findByRole('heading', { name: 'No pudimos aprobar tu solicitud' })).toBeInTheDocument();
    expect(screen.getByText('«Por ahora el plan para equipos es para consultorios con agenda compartida.»')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Enviar otra solicitud' })).toBeInTheDocument();
  });

  it('no request card once the team exists; the team card instead', async () => {
    await renderApp('/', { team: 'approved' });
    expect(await screen.findByRole('heading', { name: 'Consultorio Sonríe' })).toBeInTheDocument();
    expect(screen.getByText('3 profesionales · 2 de 2 cupos adicionales usados', { selector: 'div' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '¿Trabajas con más profesionales?' })).not.toBeInTheDocument();
  });

  it('form: validates, counts with the stepper and sends', async () => {
    const user = userEvent.setup();
    await renderApp('/team/request', { team: 'none' });
    const calls = spyTransport();
    await screen.findByRole('heading', { name: 'Plan para equipos' });
    expect(await screen.findByText('$3.900')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(calls.some((c) => c.path === '/me/team-request')).toBe(false);

    await user.type(screen.getByLabelText('Nombre del consultorio o estudio'), 'Consultorio Sonríe');
    await user.click(screen.getByRole('button', { name: 'Agregar un profesional' }));
    expect(screen.getByText('Tú y 3 profesionales más')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Quitar un profesional' }));
    await user.click(screen.getByRole('button', { name: 'Quitar un profesional' }));
    expect(screen.getByText('Tú y 1 profesional más')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitar un profesional' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Enviar solicitud' }));
    expect(await screen.findByRole('heading', { name: 'Recibimos tu solicitud' })).toBeInTheDocument();
    expect(screen.getByText('2 profesionales, contándote')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/me/team-request')?.body).toEqual({ name: 'Consultorio Sonríe', professionals: 2, message: '' });
  });
});

describe('Equipo', () => {
  it('lists the members and blocks adding when the seats are used', async () => {
    await renderApp('/team', { team: 'approved' });
    expect(await screen.findByRole('heading', { name: 'Equipo' })).toBeInTheDocument();
    expect(screen.getByText('2 de 2 cupos adicionales usados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Agregar profesional' })).toBeDisabled();
    expect(screen.getByRole('link', { name: 'Solicitar más cupos' })).toHaveAttribute('href', '/team/request');
    expect(await screen.findByText('2 servicios · Mar y jue, 8:00 a. m. – 4:00 p. m.')).toBeInTheDocument();
  });

  it('adds a member with a free seat (slug checked) and edits another', async () => {
    const user = userEvent.setup();
    await renderApp('/team', { team: 'seats' });
    await user.click(await screen.findByRole('button', { name: 'Agregar profesional' }));
    const form = screen.getByRole('form', { name: 'Agregar profesional' });
    await user.type(within(form).getByLabelText('Nombre'), 'Dra. Ana Ríos');
    await user.type(within(form).getByLabelText('Profesión'), 'Periodoncista');
    await user.type(within(form).getByLabelText('Enlace propio'), 'dra-sara-gomez');
    expect(await within(form).findByText('Ese enlace ya lo tiene otra persona.', {}, { timeout: 2000 })).toBeInTheDocument();
    // The owner's own link: the server calls it free for them, but a member can't take it.
    await user.clear(within(form).getByLabelText('Enlace propio'));
    await user.type(within(form).getByLabelText('Enlace propio'), 'dra-laura-perez');
    expect(await within(form).findByText('Ese es tu propio enlace: elige otro.')).toBeInTheDocument();
    await user.clear(within(form).getByLabelText('Enlace propio'));
    await user.type(within(form).getByLabelText('Enlace propio'), 'dra-ana-rios');
    expect(await within(form).findByText('¡Está libre!', {}, { timeout: 2000 })).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Agregar profesional' }));
    expect(await screen.findByText('Dra. Ana Ríos')).toBeInTheDocument();
    expect(screen.getByText('3 de 3 cupos adicionales usados')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Editar a Dra. Sara Gómez' }));
    const edit = screen.getByRole('form', { name: 'Editar profesional' });
    const name = within(edit).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Dra. Sara Gómez Ruiz');
    await user.click(within(edit).getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByRole('button', { name: 'Elegir a Dra. Sara Gómez Ruiz' })).toBeInTheDocument();
  });

  it('read-only plan: no adding nor saving', async () => {
    await renderApp('/team', { team: 'seats', state: 'expired' });
    expect(await screen.findByRole('button', { name: 'Agregar profesional' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
  });

  it('«Equipo» shows in the menu only with a team', async () => {
    await renderApp('/', { team: 'approved' });
    expect((await screen.findAllByRole('link', { name: 'Equipo' }))[0]).toHaveAttribute('href', '/team');
  });
});

describe('billing with a team', () => {
  it('adds the additional professionals to every package and to «Pagas hoy»', async () => {
    const user = userEvent.setup();
    await renderApp('/billing', { team: 'approved', state: 'active' });
    expect(await screen.findByRole('heading', { name: 'Tu plan: Fundador + 2 profesionales adicionales' })).toBeInTheDocument();
    expect(screen.getByText('$12.800')).toBeInTheDocument();
    expect(screen.getByText('Plan $50.000 + equipo $93.600')).toBeInTheDocument();
    expect(screen.getAllByText('$143.600').length).toBeGreaterThan(0);
    const calls = spyTransport();
    await user.click(screen.getByRole('button', { name: /3 meses/ }));
    expect(screen.getByText('Plan $15.000 + equipo $23.400')).toBeInTheDocument();
    expect(screen.getAllByText('$38.400').length).toBeGreaterThan(1);
    await user.click(screen.getByRole('button', { name: /Ya pagué/ }));
    await screen.findByText(/Recibimos tu aviso/);
    expect(calls.some((c) => c.path === '/me/billing/payment-notices' && headerOf(c) === null)).toBe(true);
  });
});

describe('admin: team requests', () => {
  it('approves with the seats stepper (default: asked − 1) and rejects with a reason', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/teams', { admin: true });
    const calls = spyTransport();
    const sonrie = await screen.findByRole('article', { name: 'Solicitud de Consultorio Sonríe' });
    expect(within(sonrie).getByRole('button', { name: 'Aprobar con 2 cupos' })).toBeInTheDocument();
    await user.click(within(sonrie).getByRole('button', { name: 'Agregar un cupo' }));
    await user.click(within(sonrie).getByRole('button', { name: 'Aprobar con 3 cupos' }));
    expect(await within(sonrie).findByText('Aprobada con 3 cupos')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/admin/team-requests/pro-laura/approve')?.body).toEqual({ seats: 3 });
    expect(await screen.findByText('Consultorio Sonríe', { selector: 'td div' })).toBeInTheDocument();

    const lua = screen.getByRole('article', { name: 'Solicitud de Estudio Lúa' });
    await user.click(within(lua).getByRole('button', { name: 'Rechazar' }));
    await user.click(within(lua).getByRole('button', { name: 'Enviar rechazo' }));
    expect(await within(lua).findByRole('alert')).toHaveTextContent('Escribe el motivo');
    await user.type(within(lua).getByLabelText('Motivo del rechazo'), 'Por ahora solo consultorios con agenda compartida.');
    await user.click(within(lua).getByRole('button', { name: 'Enviar rechazo' }));
    expect(await within(lua).findByText('Rechazada')).toBeInTheDocument();
    expect(calls.find((c) => c.path === '/admin/team-requests/pro-lua/reject')?.body).toEqual({ reason: 'Por ahora solo consultorios con agenda compartida.' });
  });

  it('prices: «Profesional adicional» column and the field of a new version', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/prices', { admin: true });
    expect(await screen.findByRole('columnheader', { name: 'Profesional adicional' })).toBeInTheDocument();
    expect(await screen.findAllByText('$3.900 / mes')).toHaveLength(2);
    const calls = spyTransport();
    await user.click(screen.getByRole('button', { name: '+ Nueva versión' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'Estándar 2');
    await user.type(within(dialog).getByLabelText('Precio mensual de referencia'), '6000');
    await user.type(within(dialog).getByLabelText('Valor por profesional adicional (al mes, COP)'), '4500');
    expect(within(dialog).getByText(/\$6\.000 \+ 2 × \$4\.500 = \$15\.000 al mes/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear versión' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST' && c.path === '/admin/prices')?.body).toMatchObject({ extraProfessionalCop: 4500 }));
  });
});
