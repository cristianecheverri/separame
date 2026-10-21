#!/usr/bin/env node
/**
 * Renders the calendar logos used by the "Agrégala a tu calendario" buttons in
 * the booking emails to public/email/*.png (served at <site>/email/*.png).
 * Email clients (Gmail, Outlook) don't render SVG, so the icons ship as PNGs at
 * 4× their 24 px display size to stay crisp on retina screens.
 * Run after changing an icon: `node scripts/email-icons.mjs`.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const outDir = join(root, 'public/email');

const ICONS = {
  // Google Calendar: four colored sides, folded red corner, blue "31".
  'google-calendar': `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect x="6" y="6" width="36" height="36" rx="5" fill="#fff"/>
    <path d="M11 6h26a5 5 0 0 1 5 5v1H6v-1a5 5 0 0 1 5-5z" fill="#4285F4"/>
    <rect x="36" y="11" width="6" height="25" fill="#4285F4"/>
    <path d="M6 11h6v25H6z" fill="#FBBC04"/>
    <path d="M6 36h30v6H11a5 5 0 0 1-5-5z" fill="#34A853"/>
    <path d="M36 36h6l-6 6z" fill="#EA4335"/>
    <text x="24" y="31.5" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="15" fill="#4285F4">31</text>
  </svg>`,
  // Outlook: light-blue envelope behind a dark-blue tile with a white "O".
  outlook: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
    <rect x="17" y="10" width="25" height="28" rx="3.5" fill="#28A8EA"/>
    <path d="M17 17l12.5 9L42 17" fill="none" stroke="#fff" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="6" y="13" width="22" height="22" rx="3.5" fill="#0A64AD"/>
    <ellipse cx="17" cy="24" rx="5.4" ry="6.6" fill="none" stroke="#fff" stroke-width="3"/>
  </svg>`,
};

function fallbackExecutable() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dir = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()[0];
  return dir ? join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell') : undefined;
}

mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: fallbackExecutable() }));
const page = await browser.newPage({ viewport: { width: 48, height: 48 }, deviceScaleFactor: 2 });
for (const [name, svg] of Object.entries(ICONS)) {
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${svg.replace('<svg ', '<svg width="48" height="48" ')}</body></html>`);
  await page.screenshot({ path: join(outDir, `${name}.png`), omitBackground: true, clip: { x: 0, y: 0, width: 48, height: 48 } });
  console.log(`public/email/${name}.png written`);
}
await browser.close();
