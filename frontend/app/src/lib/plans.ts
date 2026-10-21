/** Plan cards for the billing screen, derived from the pro's price version (never hardcoded). */
import { formatCop } from '@shared/format';
import type { PriceVersion } from '@shared/types';

export interface PlanOption {
  months: number;
  amountCop: number;
  name: string;
  tag: string;
  best: boolean;
  monthlyText: string;
}

export function buildPlans(price: PriceVersion): PlanOption[] {
  const packages = [...price.packages].sort((a, b) => {
    if (a.months === 1) return 1;
    if (b.months === 1) return -1;
    return a.months - b.months;
  });
  const perMonth = (p: { months: number; amountCop: number }) => p.amountCop / p.months;
  const multi = packages.filter((p) => p.months > 1);
  const cheapest = multi.length ? multi.reduce((best, p) => (perMonth(p) < perMonth(best) ? p : best)) : null;
  const reference = price.monthlyCop;
  const bestIsDiscounted = !!cheapest && multi.some((p) => perMonth(p) > perMonth(cheapest));
  const priceTag = `Precio ${price.name.toLowerCase()}`;

  return packages.map((p) => {
    if (p.months === 1) {
      return { ...p, name: 'Mes a mes', tag: 'Flexible', best: false, monthlyText: 'Sin compromiso' };
    }
    const best = bestIsDiscounted && p === cheapest;
    const monthly = `${formatCop(Math.round(perMonth(p)))} al mes`;
    let monthlyText = monthly;
    if (best && reference) {
      const free = Math.round(p.months - p.amountCop / reference);
      if (free >= 1) monthlyText = `${free} ${free === 1 ? 'mes gratis' : 'meses gratis'} · ${monthly}`;
    }
    return { ...p, name: `${p.months} meses`, tag: best ? 'El más conveniente' : priceTag, best, monthlyText };
  });
}

export function defaultPlanIndex(plans: PlanOption[]): number {
  const best = plans.findIndex((p) => p.best);
  return best >= 0 ? best : 0;
}

/** Smallest package amount: "Renovar desde $15.000". */
export function minPackageAmount(price: PriceVersion | null | undefined): number | null {
  if (!price || price.packages.length === 0) return null;
  return Math.min(...price.packages.map((p) => p.amountCop));
}
