#!/usr/bin/env node
/**
 * Visual QA: drives the dev server in mock mode through every screen and
 * saves screenshots at 320×568, 390×844, 768×1024 and 1440×900 into
 * ./screenshots (git-ignored). Also fails loudly on horizontal overflow.
 *
 *   npm run dev -- --port 5199 &   (or VITE_MOCK=1 npm run dev)
 *   BASE_URL=http://localhost:5199 node scripts/screenshots.mjs [filter]
 *
 * Uses the newest Chromium found in ~/Library/Caches/ms-playwright when the
 * one matching this Playwright version isn't installed.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = resolve(import.meta.dirname, '../screenshots');
const filter = process.argv[2] ?? '';
const VIEWPORTS = [
  { name: '320', width: 320, height: 568 },
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1440', width: 1440, height: 900 },
];

function fallbackExecutable() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const shells = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const dir of shells) {
    const bin = join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (existsSync(bin)) return bin;
  }
  return undefined;
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: fallbackExecutable() });
  }
}

const problems = [];

async function shot(page, vp, name, { bottom = false } = {}) {
  await page.waitForTimeout(250);
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('body *')].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && (r.right > window.innerWidth + 0.5 || r.left < -0.5);
    });
    return {
      page: doc.scrollWidth > window.innerWidth,
      elements: wide.slice(0, 3).map((el) => `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 60)}`),
    };
  });
  if (overflow.page || overflow.elements.length) problems.push(`${vp.name}/${name}: overflow ${JSON.stringify(overflow)}`);
  await page.screenshot({ path: join(OUT, `${name}-${vp.name}.png`) });
  if (bottom) {
    const scrolled = await page.evaluate(() => {
      const el = document.querySelector('.scroll-area');
      if (!el || el.scrollHeight <= el.clientHeight + 1) return false;
      el.scrollTop = el.scrollHeight;
      return true;
    });
    if (scrolled) {
      await page.waitForTimeout(150);
      await page.screenshot({ path: join(OUT, `${name}-${vp.name}-bottom.png`) });
    }
  }
}

const SLUG = '/dra-laura-perez?mock=1&delay=60';

const scenarios = {
  async landing(page, vp) {
    await page.goto(`${BASE}/`);
    await page.screenshot({ path: join(OUT, `landing-${vp.name}.png`), fullPage: true });
  },
  async legal(page, vp) {
    for (const path of ['privacy', 'terms']) {
      await page.goto(`${BASE}/${path}`);
      await page.getByRole('heading', { level: 1 }).waitFor();
      await shot(page, vp, path);
      await page.screenshot({ path: join(OUT, `${path}-${vp.name}-full.png`), fullPage: true });
    }
  },
  async notfound(page, vp) {
    await page.goto(`${BASE}/404.html`);
    await shot(page, vp, 'notfound');
  },
  async flow(page, vp) {
    await page.goto(`${BASE}${SLUG}`);
    await page.getByRole('heading', { name: '¿Qué necesitas?' }).waitFor();
    await shot(page, vp, 'step1-empty', { bottom: true });
    await page.getByRole('button', { name: /Valoración/ }).click();
    await shot(page, vp, 'step1-selected');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).waitFor();
    await shot(page, vp, 'step2-empty');
    await page.getByRole('button', { name: 'Semana siguiente' }).click();
    await shot(page, vp, 'step2-week2');
    await page.getByRole('button', { name: 'Semana anterior' }).click();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).click();
    await page.getByRole('button', { name: '10:00 a. m.' }).click();
    await shot(page, vp, 'step2-selected', { bottom: true });
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('heading', { name: '¿A nombre de quién?' }).waitFor();
    await shot(page, vp, 'step3-empty', { bottom: true });
    await page.getByLabel('Nombre completo').fill('M');
    await page.getByLabel('Correo').fill('mariana@correo');
    await page.getByLabel('Celular').fill('300 123');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await shot(page, vp, 'step3-errors', { bottom: true });
    await page.getByLabel('Nombre completo').fill('Mariana Gómez');
    await page.getByLabel('Correo').fill('mariana@correo.com');
    await page.getByLabel('Celular').fill('300 123 4567');
    await page.getByLabel('Celular').blur();
    await shot(page, vp, 'step3-filled', { bottom: true });
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('heading', { name: '¿Todo bien?' }).waitFor();
    await shot(page, vp, 'step4-review', { bottom: true });
    await page.getByRole('button', { name: 'Separar mi cita' }).click();
    await page.getByRole('heading', { name: /Tu cita quedó separada/ }).waitFor();
    await shot(page, vp, 'confirmed', { bottom: true });
  },
  async slotTaken(page, vp) {
    await page.goto(`${BASE}${SLUG}&fail=slot_taken`);
    await page.getByRole('button', { name: /Valoración/ }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).click();
    await page.getByRole('button', { name: '10:00 a. m.' }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByLabel('Nombre completo').fill('Mariana Gómez');
    await page.getByLabel('Correo').fill('mariana@correo.com');
    await page.getByLabel('Celular').fill('3001234567');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Separar mi cita' }).click();
    await page.getByText('Alguien acaba de separar esa hora').waitFor();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).waitFor();
    await shot(page, vp, 'step2-slot-taken', { bottom: true });
  },
  async singleService(page, vp) {
    await page.goto(`${BASE}${SLUG}&services=1`);
    await page.getByText('Paso 1 de 3 · Día y hora').waitFor();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).click();
    await page.getByRole('button', { name: '10:00 a. m.' }).click();
    await shot(page, vp, 'single-when');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByLabel('Nombre completo').fill('Mariana Gómez');
    await page.getByLabel('Correo').fill('mariana@correo.com');
    await page.getByLabel('Celular').fill('300 123 4567');
    await page.getByRole('checkbox').check();
    await shot(page, vp, 'single-details');
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('heading', { name: '¿Todo bien?' }).waitFor();
    await shot(page, vp, 'single-review');
  },
  async deepLink(page, vp) {
    await page.goto(`${BASE}${SLUG}&service=limpieza&date=2026-10-30`);
    await page.getByRole('button', { name: 'Viernes 30 de octubre', pressed: true }).waitFor();
    await shot(page, vp, 'deeplink');
  },
  async waitlist(page, vp) {
    await page.goto(`${BASE}${SLUG}`);
    await page.getByRole('button', { name: /Valoración/ }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: 'Martes 20 de octubre, sin horas libres' }).click();
    await page.getByRole('button', { name: /¿No encuentras hora/ }).waitFor();
    await shot(page, vp, 'waitlist-card');
    await page.getByRole('button', { name: /¿No encuentras hora/ }).click();
    await page.getByRole('heading', { name: 'Te avisamos si se libera un cupo' }).waitFor();
    await page.getByRole('button', { name: 'Jueves 22 de octubre' }).click();
    await shot(page, vp, 'waitlist-form', { bottom: true });
    await page.getByLabel('Nombre completo').fill('Mariana Gómez');
    await page.getByLabel('Correo').fill('mariana@correo.com');
    await page.getByLabel('Celular').fill('300 123 4567');
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Avisarme si se libera' }).click();
    await page.getByRole('heading', { name: /Te escribiremos a/ }).waitFor();
    await shot(page, vp, 'waitlist-done');
  },
  async waitlistEmpty(page, vp) {
    await page.goto(`${BASE}${SLUG}&state=empty`);
    await page.getByRole('button', { name: /Valoración/ }).click();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('button', { name: /¿No encuentras hora/ }).waitFor();
    await shot(page, vp, 'waitlist-empty');
  },
  async attendance(page, vp) {
    await page.goto(`${BASE}/c/demo-token?mock=1&delay=60&action=confirm`);
    await page.getByRole('heading', { name: /Confirmaste tu asistencia/ }).waitFor();
    await shot(page, vp, 'manage-attended');
    await page.goto(`${BASE}/c/confirmed?mock=1&delay=60`);
    await page.getByText('Asistencia confirmada').waitFor();
    await shot(page, vp, 'manage-menu-confirmed');
  },
  async leave(page, vp) {
    await page.goto(`${BASE}/w/tok?mock=1&delay=60`);
    await page.getByRole('heading', { name: /ya no estás en la lista/ }).waitFor();
    await shot(page, vp, 'waitlist-leave');
    await page.goto(`${BASE}/w/invalid?mock=1&delay=60`);
    await page.getByRole('heading', { name: 'Este enlace no es válido' }).waitFor();
    await shot(page, vp, 'waitlist-leave-invalid');
  },
  async unavailable(page, vp) {
    await page.goto(`${BASE}${SLUG}&state=unavailable`);
    await page.getByText('Agenda no disponible temporalmente').waitFor();
    await shot(page, vp, 'unavailable', { bottom: true });
  },
  async manage(page, vp) {
    await page.goto(`${BASE}/c/demo-token?mock=1&delay=60`);
    await page.getByRole('heading', { name: /Qué quieres hacer/ }).waitFor();
    await shot(page, vp, 'manage-menu', { bottom: true });
    await page.getByRole('button', { name: /Cambiar día u hora/ }).click();
    await page.getByRole('button', { name: 'Viernes 23 de octubre' }).click();
    await page.getByRole('button', { name: '8:30 a. m.' }).click();
    await shot(page, vp, 'manage-move', { bottom: true });
    await page.getByRole('button', { name: 'Volver' }).click();
    await page.getByRole('button', { name: /Cancelar la cita/ }).click();
    await shot(page, vp, 'manage-cancel', { bottom: true });
    await page.getByRole('button', { name: 'Mejor la cambio de día' }).click();
    await page.getByRole('button', { name: 'Viernes 23 de octubre' }).click();
    await page.getByRole('button', { name: '8:30 a. m.' }).click();
    await page.getByRole('button', { name: /Mover a/ }).click();
    await page.getByRole('heading', { name: 'Listo, tu cita cambió.' }).waitFor();
    await shot(page, vp, 'manage-moved');
  },
  async manageCancelled(page, vp) {
    await page.goto(`${BASE}/c/demo-token?mock=1&delay=60`);
    await page.getByRole('button', { name: /Cancelar la cita/ }).click();
    await page.getByLabel('Motivo (opcional)').fill('Me salió un viaje');
    await page.getByRole('button', { name: 'Sí, cancelar la cita' }).click();
    await page.getByRole('heading', { name: 'Tu cita quedó cancelada.' }).waitFor();
    await shot(page, vp, 'manage-cancelled');
  },
  async manageLate(page, vp) {
    await page.goto(`${BASE}/c/late?mock=1&delay=60`);
    await page.getByRole('heading', { name: /Ya no se puede/ }).waitFor();
    await shot(page, vp, 'manage-late');
  },
};

mkdirSync(OUT, { recursive: true });
const browser = await launch();
try {
  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: 2,
      locale: 'es-CO',
      reducedMotion: 'reduce',
    });
    for (const [name, run] of Object.entries(scenarios)) {
      if (filter && !name.includes(filter) && filter !== vp.name) continue;
      const page = await context.newPage();
      try {
        await run(page, vp);
      } catch (error) {
        problems.push(`${vp.name}/${name}: ${error.message.split('\n')[0]}`);
        await page.screenshot({ path: join(OUT, `ERROR-${name}-${vp.name}.png`) }).catch(() => {});
      }
      await page.close();
    }
    await context.close();
  }
} finally {
  await browser.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n- ${problems.join('\n- ')}`);
  process.exitCode = 1;
} else {
  console.log(`Screenshots saved to ${OUT}`);
}
