#!/usr/bin/env node
/**
 * Renders public/og.png (1200×630 Open Graph image for the landing) with
 * Playwright from inline HTML and the self-hosted fonts. Run after design
 * changes: `node scripts/og.mjs`.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
// Inlined as data URLs: about:blank can't load file:// fonts.
const font = (pkg, file) =>
  `data:font/woff2;base64,${readFileSync(join(root, 'node_modules/@fontsource', pkg, 'files', file)).toString('base64')}`;

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:B;font-weight:800;src:url(${font('bricolage-grotesque', 'bricolage-grotesque-latin-800-normal.woff2')})}
@font-face{font-family:F;font-weight:600;src:url(${font('figtree', 'figtree-latin-600-normal.woff2')})}
body{margin:0;width:1200px;height:630px;background:#0B6E4F;color:#fff;font-family:F,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:72px 80px;box-sizing:border-box}
.mark{font-family:B;font-weight:800;font-size:48px;letter-spacing:-1px}.mark span{color:#FFC93C}
h1{font-family:B;font-weight:800;font-size:78px;line-height:1.02;letter-spacing:-2px;margin:0;max-width:960px}
.foot{display:flex;gap:16px;align-items:center;font-size:30px;color:#D5EDE3}
.pill{background:#FFC93C;color:#15241D;border-radius:999px;padding:14px 28px;font-weight:600}
</style></head><body>
<div class="mark">sepárame<span>.</span></div>
<h1>Tu agenda en línea, lista para que te separen citas.</h1>
<div class="foot"><span class="pill">Prueba gratis 10 días</span><span>separame.app</span></div>
</body></html>`;

function fallbackExecutable() {
  const cache = join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dir = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse()[0];
  return dir ? join(cache, dir, 'chrome-headless-shell-mac-arm64/chrome-headless-shell') : undefined;
}

const browser = await chromium.launch().catch(() => chromium.launch({ executablePath: fallbackExecutable() }));
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html, { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: join(root, 'public/og.png') });
await browser.close();
console.log('public/og.png written');
