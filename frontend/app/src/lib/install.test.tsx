import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { fakeInstallPrompt } from '../mocks/install';
import { renderApp } from '../test/renderApp';
import { detectVariant, dismissInstall, installStore, isDismissed } from './install';

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/126.0 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
const FIREFOX_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:131.0) Gecko/20100101 Firefox/131.0';
const ANDROID_CHROME = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36';

describe('install variant', () => {
  const base = { standalone: false, hasPrompt: false, installed: false };
  it.each([
    ['Chromium with a deferred prompt', { ...base, ua: ANDROID_CHROME, hasPrompt: true }, 'prompt'],
    ['iPhone Safari', { ...base, ua: IPHONE_SAFARI }, 'ios'],
    ['iPhone Chrome', { ...base, ua: IPHONE_CHROME }, 'ios-other'],
    ['iPadOS (desktop UA, touch)', { ...base, ua: IPAD_DESKTOP_UA, maxTouchPoints: 5 }, 'ios'],
    ['Firefox desktop', { ...base, ua: FIREFOX_DESKTOP }, 'none'],
    ['Android without the prompt yet', { ...base, ua: ANDROID_CHROME }, 'none'],
    ['already installed (standalone)', { ...base, ua: IPHONE_SAFARI, standalone: true }, 'installed'],
    ['after appinstalled', { ...base, ua: ANDROID_CHROME, hasPrompt: true, installed: true }, 'installed'],
  ])('%s', (_label, input, expected) => {
    expect(detectVariant(input)).toBe(expected);
  });

  it('remembers "Ahora no" for 14 days', () => {
    localStorage.clear();
    const now = Date.UTC(2026, 9, 20);
    expect(isDismissed(now)).toBe(false);
    dismissInstall(now);
    expect(isDismissed(now + 13 * 86_400_000)).toBe(true);
    expect(isDismissed(now + 15 * 86_400_000)).toBe(false);
  });
});

describe('install card', () => {
  it('is hidden when no install path applies', async () => {
    await renderApp('/');
    await screen.findByText('Carlos Mejía');
    expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument();
  });

  it('uses the native prompt and confirms the installation', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    installStore.override('prompt', fakeInstallPrompt());
    const cards = await screen.findAllByRole('region', { name: 'Instalar la app' });
    await user.click(within(cards[0]).getByRole('button', { name: 'Instalar' }));
    expect(await screen.findByText('¡Listo! Ya tienes Sepárame en tu pantalla de inicio.')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Instalar la app' })).not.toBeInTheDocument());
  });

  it('shows the Safari steps on iPhone', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    installStore.override('ios');
    const cards = await screen.findAllByRole('region', { name: 'Instalar la app' });
    await user.click(within(cards[0]).getByRole('button', { name: 'Instalar' }));
    const sheet = await screen.findByRole('dialog', { name: 'Instala Sepárame en tu iPhone' });
    expect(within(sheet).getByText('Compartir')).toBeInTheDocument();
    expect(within(sheet).getByText('«Agregar a inicio»')).toBeInTheDocument();
  });

  it('can be dismissed', async () => {
    const user = userEvent.setup();
    await renderApp('/');
    installStore.override('ios');
    const cards = await screen.findAllByRole('region', { name: 'Instalar la app' });
    await user.click(within(cards[0]).getByRole('button', { name: 'Ahora no' }));
    expect(isDismissed()).toBe(true);
  });
});
