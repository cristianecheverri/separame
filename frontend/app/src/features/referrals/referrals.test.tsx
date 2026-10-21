import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { auth } from '../../lib/auth';
import { renderApp } from '../../test/renderApp';
import { captureReferralCode, clearReferralCode, storedReferralCode } from './storedCode';

afterEach(() => vi.restoreAllMocks());

describe('referral code storage', () => {
  it('keeps a valid ?ref= for 30 days and ignores malformed codes', () => {
    localStorage.clear();
    const t0 = Date.UTC(2026, 9, 20);
    expect(captureReferralCode('?ref=Laura-Perez', t0)).toBe('laura-perez');
    expect(captureReferralCode('?ref=<x>', t0)).toBe('laura-perez');
    expect(storedReferralCode(t0 + 29 * 86_400_000)).toBe('laura-perez');
    expect(storedReferralCode(t0 + 31 * 86_400_000)).toBeNull();
    captureReferralCode('?ref=estudio-lua', t0);
    clearReferralCode();
    expect(storedReferralCode(t0)).toBeNull();
  });
});

describe('signup with a referral link', () => {
  it('shows who invited you and sends the code to Cognito as clientMetadata', async () => {
    const user = userEvent.setup();
    await renderApp('/signup?ref=laura-perez', { signedIn: false, state: 'onboarding' });
    expect(await screen.findByText('Te invitó Dra. Laura Pérez')).toBeInTheDocument();
    expect(screen.getByText('LP')).toBeInTheDocument();
    expect(storedReferralCode()).toBe('laura-perez');
    const signUp = vi.spyOn(auth.client, 'signUp');
    await user.type(screen.getByLabelText('Correo'), 'nueva@correo.co');
    await user.type(screen.getByLabelText('Contraseña'), 'separame1');
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('nueva@correo.co', 'separame1', { referralCode: 'laura-perez' }));
  });

  it('shows nothing for an unknown code', async () => {
    await renderApp('/signup?ref=nadie-aqui', { signedIn: false, state: 'onboarding' });
    expect(await screen.findByRole('heading', { name: 'Crea tu cuenta' })).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(/Te invitó/)).not.toBeInTheDocument();
  });
});

describe('panel', () => {
  it('agenda: "Invita y gana un mes" card with the link and months earned', async () => {
    await renderApp('/', { state: 'active' });
    const card = (await screen.findByRole('heading', { name: 'Invita y gana un mes' })).closest('section')!;
    expect(await within(card).findByText('separame.app/r/laura-perez')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Copiar tu enlace de invitación' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: 'Compartir' })).toBeInTheDocument();
    expect(within(card).getByText('Has ganado 2 meses')).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Ver referidos' })).toHaveAttribute('href', '/billing#referidos');
  });

  it('copies the link and says so', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await renderApp('/', { state: 'trial' });
    const button = await screen.findByRole('button', { name: 'Copiar tu enlace de invitación' });
    await user.click(button);
    expect(writeText).toHaveBeenCalledWith('https://separame.app/r/laura-perez');
    expect(await within(button).findByText('¡Copiado!')).toBeInTheDocument();
  });

  it('Suscripción: referrals section, people with their state and the history rows', async () => {
    await renderApp('/billing', { state: 'active' });
    expect(await screen.findByText(/· incluye 2 meses ganados por referidos/)).toBeInTheDocument();
    const section = (await screen.findByRole('heading', { name: 'Referidos' })).closest('section')!;
    expect(within(section).getByText('Personas que invitaste (3)')).toBeInTheDocument();
    expect(within(section).getByText('Abogado · se registró el 15 oct. · prueba hasta el 25 oct.')).toBeInTheDocument();
    expect(within(section).getByText('Se registró · en prueba')).toBeInTheDocument();
    expect(within(section).getAllByText('Pagó · ganaste 1 mes ✓')).toHaveLength(2);
    expect(within(section).getByText('ya sumados a tu plan')).toBeInTheDocument();
    expect(screen.getByText('Mes gratis por referido · Camilo Arango')).toBeInTheDocument();
    expect(screen.getByText('14 oct. 2026 · tu plan pasó del 14 dic. al 14 ene. 2027')).toBeInTheDocument();
    expect(screen.getAllByText('+1 mes')).toHaveLength(2);
  });

  it('Suscripción when expired: the saved month, on the plan date and in the kicker', async () => {
    await renderApp('/billing', { state: 'expired' });
    expect(await screen.findByText(/· tienes 1 mes guardado por referidos/)).toBeInTheDocument();
    expect(await screen.findByText('Mes guardado: se aplica en tu próximo pago')).toBeInTheDocument();
    expect(screen.getByText('2 aplicados · 1 guardado')).toBeInTheDocument();
    expect(screen.getByText(/\(\+1 mes guardado: \d+ de \w+\)/)).toBeInTheDocument();
  });
});

describe('admin pro detail', () => {
  it('shows who referred the pro, their referrals and the referral month in the history', async () => {
    await renderApp('/admin/pros/pro-lua', { admin: true });
    expect(await screen.findByRole('link', { name: 'Dra. Laura Pérez' })).toHaveAttribute('href', '/admin/pros/pro-laura');
    expect(screen.getByText(/Referido por/)).toBeInTheDocument();
    const card = screen.getByRole('region', { name: 'Sus referidos' });
    expect(within(card).getByText('1 mes ganado')).toBeInTheDocument();
    expect(within(card).getByText('separame.app/r/estudio-lua')).toBeInTheDocument();
    expect(within(card).getByText('Pagó · ganó 1 mes ✓')).toBeInTheDocument();
    expect(within(card).getByText('Se registró · en prueba')).toBeInTheDocument();
    expect(within(card).getByText('Sin pago')).toBeInTheDocument();
    expect(within(card).getByText('Su prueba terminó el 30 sep. sin pago')).toBeInTheDocument();
    expect(screen.getByText('Mes gratis por referido')).toBeInTheDocument();
    expect(screen.getByText('2 sep. 2026 · por Barbería El Parche · hasta 18 oct. 2026 · automático')).toBeInTheDocument();
  });
});

describe('services: price display option', () => {
  it('chooses how the price shows, with a live preview; keeps it when toggling visibility', async () => {
    const matchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
    onTestFinished(() => {
      window.matchMedia = matchMedia;
    });
    const user = userEvent.setup();
    await renderApp('/services');
    // "Control" comes as "Precio a convenir" in the mocks.
    const controlRow = await screen.findByRole('button', { name: 'Editar Control' });
    expect(within(controlRow).getByText(/Precio a convenir/)).toBeInTheDocument();
    await user.click(controlRow);
    const editor = screen.getByRole('region', { name: 'Editar servicio' });
    expect(within(editor).getByRole('button', { name: 'Precio a convenir' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(editor).getByText('Tu página dice «Precio a convenir»: lo acuerdas en la cita.')).toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: 'No mostrar' }));
    expect(within(editor).getByText('Tu página no muestra ningún precio para este servicio.')).toBeInTheDocument();
    await user.click(within(editor).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(within(screen.getByRole('button', { name: 'Editar Control' })).getByText(/Sin precio visible/)).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Mostrar Control en mi página' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Mostrar Control en mi página' })).toHaveAttribute('aria-pressed', 'false'));
    expect(within(screen.getByRole('button', { name: 'Editar Control' })).getByText(/Sin precio visible/)).toBeInTheDocument();

    await user.click(within(editor).getByRole('button', { name: 'Valor fijo' }));
    expect(within(editor).getByLabelText('Valor de referencia')).toHaveAttribute('placeholder', 'Valor en pesos');
    await user.click(within(editor).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(editor).findByText('Escribe el valor de referencia')).toBeInTheDocument();
    await user.type(within(editor).getByLabelText('Valor de referencia'), '45000');
    expect(within(editor).getByText('$45.000')).toBeInTheDocument();
  });
});
