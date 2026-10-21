// Visual QA: screenshots every screen of the mock-mode app at four viewports and
// flags horizontal page overflow. Start the app first: `npm run dev:mock`.
// Usage: node scripts/screenshots.mjs [filter] [--base=http://localhost:5174/app]
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { browserExecutable } from './browser.mjs';

const args = process.argv.slice(2);
const base = (args.find((a) => a.startsWith('--base='))?.slice(7) ?? 'http://localhost:5174/app').replace(/\/$/, '');
const filter = args.find((a) => !a.startsWith('--'));
const out = new URL('../screenshots/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });

const VIEWPORTS = [
  [360, 780],
  [768, 1024],
  [1280, 860],
  [1440, 900],
];

/** name, path (with mock switches), optional action before the shot. */
const SCREENS = [
  ['agenda', '/?as=pro&state=trial'],
  ['agenda-week', '/?as=pro&state=trial', async (p) => p.getByRole('button', { name: 'Semana', exact: true }).click()],
  ['agenda-new-modal', '/?as=pro&state=trial', async (p) => {
    await p.getByRole('button', { name: 'Nueva cita' }).first().click();
    await p.getByRole('button', { name: /Valoración/ }).click();
  }],
  ['agenda-expired', '/?as=pro&state=expired'],
  ['agenda-install-android', '/?as=pro&state=trial&install=android'],
  ['agenda-install-ios', '/?as=pro&state=trial&install=ios', async (p) => p.getByRole('button', { name: 'Instalar' }).filter({ visible: true }).first().click()],
  ['appointments', '/appointments?as=pro&state=trial'],
  ['appointments-unmarked', '/appointments?as=pro&state=trial&tab=past&filter=unmarked'],
  ['appointments-waitlist', '/appointments?as=pro&state=trial&tab=waitlist'],
  ['clients', '/clients?as=pro&state=trial'],
  ['client-detail', '/clients/c-ana.maria.salazar?as=pro&state=trial'],
  ['stats', '/stats?as=pro&state=trial'],
  ['stats-90', '/stats?as=pro&state=trial', async (p) => p.getByRole('button', { name: 'Últimos 90 días' }).click()],
  ['services', '/services?as=pro&state=trial'],
  ['services-expired', '/services?as=pro&state=expired'],
  ['availability', '/availability?as=pro&state=trial'],
  ['calendar-sync', '/calendar-sync?as=pro&state=trial'],
  ['calendar-sync-expired', '/calendar-sync?as=pro&state=expired'],
  ['billing', '/billing?as=pro&state=trial&billing=none'],
  ['billing-pending', '/billing?as=pro&state=trial&billing=pending'],
  ['billing-expired', '/billing?as=pro&state=expired&billing=rejected'],
  ['profile', '/profile?as=pro&state=trial'],
  ['onboarding', '/onboarding?as=pro&state=onboarding'],
  ['login', '/login?as=guest'],
  ['signup', '/signup?as=guest'],
  ['admin', '/admin?as=admin&state=trial'],
  ['admin-overview', '/admin/overview?as=admin&state=trial'],
  ['admin-pro', '/admin/pros/pro-lua?as=admin&state=trial'],
  ['admin-pro-done', '/admin/pros/pro-lua?as=admin&state=trial', async (p) => {
    await p.getByRole('button', { name: 'Registrar pago y activar agenda' }).click();
    await p.getByText('Pago registrado.').waitFor();
  }],
  ['admin-prices', '/admin/prices?as=admin&state=trial'],
  ['drawer', '/?as=pro&state=trial', async (p) => {
    const menu = p.getByRole('button', { name: 'Abrir menú' });
    if (await menu.isVisible()) await menu.click();
  }],
];

const browser = await chromium.launch({ executablePath: browserExecutable() });
const problems = [];
for (const [name, path, action] of SCREENS) {
  if (filter && !name.includes(filter)) continue;
  for (const [width, height] of VIEWPORTS) {
    if (name === 'drawer' && width >= 1024) continue;
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'es-CO' });
    const page = await context.newPage();
    page.on('pageerror', (e) => problems.push(`${name}@${width}: ${e.message}`));
    page.on('console', (m) => m.type() === 'error' && problems.push(`${name}@${width}: console ${m.text()}`));
    await page.goto(`${base}${path}`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10_000 }).catch(() => problems.push(`${name}@${width}: still loading`));
    if (action) {
      await action(page);
      await page.waitForTimeout(300);
      await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10_000 }).catch(() => {});
    }
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) problems.push(`${name}@${width}: horizontal overflow ${overflow}px`);
    // Overlays (drawer, modals) are fixed to the viewport: capture just the viewport.
    await page.screenshot({ path: `${out}${name}-${width}.png`, fullPage: !['drawer', 'agenda-new-modal', 'agenda-install-ios'].includes(name) });
    await context.close();
  }
  console.log(`✓ ${name}`);
}
await browser.close();
if (problems.length) {
  console.log('\nProblems:');
  for (const p of problems) console.log(' - ' + p);
  process.exitCode = 1;
} else console.log('\nNo overflow or runtime errors.');
