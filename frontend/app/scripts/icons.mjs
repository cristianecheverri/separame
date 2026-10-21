// One-off: renders public/favicon.svg into the PWA PNG icons with the cached Chromium.
// Usage: node scripts/icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { browserExecutable } from './browser.mjs';

const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch({ executablePath: browserExecutable() });
const page = await browser.newPage();
const targets = [
  ['pwa-192.png', 192, 0],
  ['pwa-512.png', 512, 0],
  ['apple-touch-icon.png', 180, 0],
  ['pwa-maskable-512.png', 512, 0.12],
];
for (const [file, size, pad] of targets) {
  const inner = Math.round(size * (1 - pad * 2));
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:${pad ? '#0B6E4F' : 'transparent'};display:grid;place-items:center;width:${size}px;height:${size}px">` +
      `<div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`,
  );
  await page.screenshot({ path: new URL(`../public/${file}`, import.meta.url).pathname, omitBackground: !pad });
}
// Monochrome badge for Android notifications: white glyph on transparent.
const glyph = svg.replace(/<rect[^>]*\/>/, '').replace(/fill="#fff"/, 'fill="#FFFFFF"').replace(/<circle[^>]*\/>/, '<circle cx="46" cy="44" r="4.2" fill="#FFFFFF"/>');
await page.setViewportSize({ width: 72, height: 72 });
await page.setContent(`<html><body style="margin:0;background:transparent">${glyph.replace('<svg ', '<svg width="72" height="72" ')}</body></html>`);
await page.screenshot({ path: new URL('../public/badge-72.png', import.meta.url).pathname, omitBackground: true });
await browser.close();
console.log('icons written');
