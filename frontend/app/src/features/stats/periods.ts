import { addDays, type ISODate } from '@shared/time';

export type PeriodKey = 'month' | 'lastMonth' | 'last90' | 'year';

export const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: 'month', label: 'Este mes' },
  { key: 'lastMonth', label: 'Mes pasado' },
  { key: 'last90', label: 'Últimos 90 días' },
  { key: 'year', label: 'Este año' },
];

const pad = (n: number) => String(n).padStart(2, '0');
const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Bogotá date range for a period chip, relative to `today`. */
export function periodRange(key: PeriodKey, today: ISODate): { from: ISODate; to: ISODate } {
  const [y, m] = today.split('-').map(Number);
  switch (key) {
    case 'month':
      return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${pad(lastDayOf(y, m))}` };
    case 'lastMonth': {
      const py = m === 1 ? y - 1 : y;
      const pm = m === 1 ? 12 : m - 1;
      return { from: `${py}-${pad(pm)}-01`, to: `${py}-${pad(pm)}-${pad(lastDayOf(py, pm))}` };
    }
    case 'last90':
      return { from: addDays(today, -89), to: today };
    case 'year':
      return { from: `${y}-01-01`, to: today };
  }
}

/** "+12 %" (counts) or "+3 pts" (ratios); null when there is nothing to compare with. */
export function delta(current: number, previous: number, kind: 'count' | 'ratio'): { text: string; direction: -1 | 0 | 1 } | null {
  if (kind === 'ratio') {
    const pts = Math.round((current - previous) * 100);
    return { text: `${pts > 0 ? '+' : ''}${pts} pts`, direction: Math.sign(pts) as -1 | 0 | 1 };
  }
  if (previous === 0) return current === 0 ? { text: 'Igual', direction: 0 } : null;
  const pct = Math.round(((current - previous) / previous) * 100);
  return { text: pct === 0 ? 'Igual' : `${pct > 0 ? '+' : ''}${pct} %`, direction: Math.sign(pct) as -1 | 0 | 1 };
}
