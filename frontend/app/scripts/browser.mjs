// Finds a Chromium in the local Playwright cache, so the scripts work even when the
// installed @playwright/test expects a newer browser revision than the one cached.
import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export function browserExecutable() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH || join(homedir(), 'Library/Caches/ms-playwright');
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const dir of dirs) {
    for (const sub of ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64']) {
      const bin = join(cache, dir, sub, 'chrome-headless-shell');
      if (existsSync(bin)) return bin;
    }
  }
  return undefined;
}
