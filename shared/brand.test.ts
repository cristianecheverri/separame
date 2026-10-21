import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import brand from './brand.json';

/** brand.json key → Tailwind v4 theme variable in frontend/theme.css. */
const THEME_VARS: Record<keyof typeof brand.colors, string | null> = {
  green: '--color-primary',
  greenDark: '--color-primary-dark',
  greenSoft: '--color-primary-soft',
  greenLine: '--color-primary-line',
  mint: '--color-mint',
  yellow: '--color-accent',
  yellowDeep: '--color-accent-deep',
  yellowSoft: '--color-accent-soft',
  yellowInk: '--color-accent-ink',
  orangeSoft: '--color-warn-soft',
  orangeInk: '--color-warn-ink',
  warn: '--color-warn',
  ink: '--color-ink',
  ink2: '--color-ink-2',
  muted: '--color-muted',
  faint: '--color-faint',
  line: '--color-line',
  lineStrong: '--color-line-strong',
  radio: '--color-radio',
  surface: '--color-surface',
  disabled: '--color-disabled',
  white: null,
};

describe('design tokens', () => {
  const css = readFileSync(join(__dirname, '../frontend/theme.css'), 'utf8');

  it.each(Object.entries(THEME_VARS).filter(([, v]) => v))('%s matches frontend/theme.css', (key, cssVar) => {
    const match = css.match(new RegExp(`${cssVar}:\\s*(#[0-9A-Fa-f]{6});`));
    expect(match?.[1]?.toUpperCase()).toBe(brand.colors[key as keyof typeof brand.colors].toUpperCase());
  });
});
