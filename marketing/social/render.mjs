// Renders every social image to out/*.png.
// Usage (from the repo root): node marketing/social/render.mjs
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(here, '../../frontend/booking/package.json'));
const { chromium } = require('@playwright/test');

const IMAGES = [
  { page: 'profile', width: 1080, height: 1080 },
  { page: 'facebook-cover', width: 1640, height: 624 },
  { page: 'linkedin-featured', width: 1200, height: 627 },
  { page: 'ad-feed', width: 1080, height: 1350 },
  { page: 'ad-story', width: 1080, height: 1920 },
];

const browser = await chromium.launch({ channel: 'chrome' }); // the installed Google Chrome
for (const { page: name, width, height } of IMAGES) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto(pathToFileURL(join(here, `${name}.html`)).href);
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: join(here, 'out', `${name}.png`) });
  await page.close();
  console.log(`out/${name}.png  ${width}×${height}`);
}
await browser.close();
