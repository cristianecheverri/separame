import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderApp } from '../test/renderApp';

describe('pro panel (mock API)', () => {
  it('shows the agenda of the day like the mockup', async () => {
    await renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Laura. Hoy tienes 6 citas.' })).toBeInTheDocument();
    expect(await screen.findByText('Espacio libre')).toBeInTheDocument();
    expect(screen.getByText('Valentina Osorio')).toBeInTheDocument();
    expect(screen.getAllByText('Confirmada').length).toBeGreaterThan(0);
    expect(screen.getByText('Te quedan 5 días', { selector: 'div' })).toBeInTheDocument();
    expect(await screen.findByText('Lunes 2 nov.')).toBeInTheDocument();
  });

  it('cancels an appointment optimistically', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Cancelar cita de Carlos Mejía' }));
    const dialog = await screen.findByRole('dialog', { name: '¿Cancelar la cita de Carlos Mejía?' });
    await user.click(within(dialog).getByRole('button', { name: 'Sí, cancelar cita' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Hola, Laura. Hoy tienes 5 citas.' })).toBeInTheDocument();
  });

  it('closes modals with Escape', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    await user.click(await screen.findByRole('button', { name: 'Nueva cita' }));
    expect(await screen.findByRole('dialog', { name: 'Nueva cita' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('is read-only when the plan expired', async () => {
    await renderApp('/', { state: 'expired' });
    expect(await screen.findByText('Tu plan venció el 15 de octubre')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Hoy tienes 3 citas' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nueva cita' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: /Mover cita/ })).not.toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Renovar desde $15.000' })).toBeInTheDocument();
    // Each badge exists twice (phone and desktop positions; CSS hides one per breakpoint).
    expect(screen.getAllByText('Recordatorio enviado')).toHaveLength(6);
  });

  it('toggles a service visibility', async () => {
    const user = userEvent.setup();
    await renderApp('/services');
    const toggle = await screen.findByRole('button', { name: 'Mostrar Blanqueamiento en mi página' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-pressed', 'true'));
  });

  it('sends a "Ya pagué" notice and shows it in review', async () => {
    const user = userEvent.setup();
    await renderApp('/billing');
    expect(await screen.findByText('25 de octubre de 2027')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Ya pagué · avisar' }));
    expect(await screen.findByText(/Recibimos tu aviso\./)).toBeInTheDocument();
    expect(await screen.findByText(/Aviso de pago en revisión · plan 12 meses/)).toBeInTheDocument();
  });

  it('warns about unsaved availability changes', async () => {
    const user = userEvent.setup();
    await renderApp('/availability');
    await user.click(await screen.findByRole('button', { name: 'Cerrar en festivos' }));
    expect(screen.getAllByText('Cambios sin guardar').length).toBeGreaterThan(0);
    await user.click(screen.getAllByRole('button', { name: 'Guardar cambios' })[0]);
    expect(await screen.findByText('Listo, tu disponibilidad quedó guardada.')).toBeInTheDocument();
  });

  it('sends new users to onboarding', async () => {
    await renderApp('/', { state: 'onboarding' });
    expect(await screen.findByRole('heading', { name: 'Tu perfil' })).toBeInTheDocument();
  });
});

describe('auth', () => {
  it('redirects to login and explains wrong passwords', async () => {
    const user = userEvent.setup();
    await renderApp('/', { signedIn: false });
    expect(await screen.findByRole('heading', { name: 'Entra a tu agenda' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Correo'), 'laura@consultoriolaura.co');
    await user.type(screen.getByLabelText('Contraseña'), 'incorrecta');
    await user.click(screen.getByRole('button', { name: 'Entrar' }));
    expect(await screen.findByText('Correo o contraseña incorrectos.')).toBeInTheDocument();
  });

  it('signs up, confirms the code and lands on onboarding', async () => {
    const user = userEvent.setup();
    await renderApp('/signup', { signedIn: false, state: 'onboarding' });
    await user.type(await screen.findByLabelText('Correo'), 'nueva@correo.co');
    await user.type(screen.getByLabelText('Contraseña'), 'separame1');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await user.type(await screen.findByLabelText('Código de 6 dígitos'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar y entrar' }));
    expect(await screen.findByRole('heading', { name: 'Tu perfil' }, { timeout: 3000 })).toBeInTheDocument();
  });
});

describe('admin (mock API)', () => {
  it('lists subscriptions with the pending notice first', async () => {
    await renderApp('/admin', { admin: true });
    await screen.findByRole('link', { name: 'Ver Estudio Lúa' });
    const rows = screen.getAllByRole('row');
    expect(within(rows[1]).getByRole('link', { name: 'Ver Estudio Lúa' })).toBeInTheDocument();
    expect(within(rows[1]).getByText('Aviso de pago')).toBeInTheDocument();
    expect(screen.getByText('Avisos por revisar')).toBeInTheDocument();
  });

  it('records a manual payment with the live preview', async () => {
    const user = userEvent.setup();
    await renderApp('/admin/pros/pro-lua', { admin: true });
    expect(await screen.findByText('20 ene. 2027')).toBeInTheDocument();
    expect(screen.getByText('Se cuenta desde hoy porque el plan ya había vencido')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '+12 meses' }));
    expect(screen.getByText('20 oct. 2027')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Registrar pago y activar agenda' }));
    expect(await screen.findByText('Pago registrado. Vigente hasta el 20 oct. 2027.')).toBeInTheDocument();
  });

  it('keeps non-admins out', async () => {
    await renderApp('/admin');
    expect(await screen.findByRole('heading', { level: 1, name: /Hola, Laura/ })).toBeInTheDocument();
  });
});
