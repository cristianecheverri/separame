/** Plan cards for the billing screen, derived from the pro's price version (never hardcoded). */
import { formatCop } from '@shared/format';
import { teamPackageAmount } from '@shared/subscription';
import type { PriceVersion } from '@shared/types';

export interface PlanOption {
  months: number;
  amountCop: number;
  name: string;
  tag: string;
  best: boolean;
  monthlyText: string;
  /** Team plan: the package alone and the additional professionals' part (`amountCop` = both). */
  team?: { planCop: number; teamCop: number };
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

/**
 * Team plan: the same packages with `seats` additional professionals added
 * (`teamPackageAmount`, the amount the server records for a «Ya pagué» notice).
 */
export function withTeamSeats(plans: PlanOption[], seats: number, extraProfessionalCop: number | null): PlanOption[] {
  if (seats <= 0) return plans;
  return plans.map((p) => {
    const amountCop = teamPackageAmount(p, seats, extraProfessionalCop);
    return { ...p, amountCop, team: { planCop: p.amountCop, teamCop: amountCop - p.amountCop } };
  });
}

export function defaultPlanIndex(plans: PlanOption[]): number {
  const best = plans.findIndex((p) => p.best);
  return best >= 0 ? best : 0;
}

/** Smallest package amount: "Renovar desde $15.000". */
/** Cheapest package, including the team's additional professionals (team plan). */
export function minPackageAmount(price: PriceVersion | null | undefined, teamSeats = 0): number | null {
  if (!price || price.packages.length === 0) return null;
  return Math.min(...price.packages.map((p) => teamPackageAmount(p, teamSeats, price.extraProfessionalCop)));
}

/** Monthly headline («desde $X/mes»), including the team's additional professionals. */
export function monthlyAmount(price: PriceVersion | null | undefined, teamSeats = 0): number | null {
  if (price?.monthlyCop == null) return null;
  return price.monthlyCop + Math.max(0, teamSeats) * (price.extraProfessionalCop ?? 0);
}
