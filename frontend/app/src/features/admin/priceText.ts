import { formatCop } from '@shared/format';
import type { PriceVersion, PriceVersionStatus } from '@shared/types';

export const STATUS_TAG: Record<PriceVersionStatus, { label: string; className: string }> = {
  active: { label: 'Activa', className: 'bg-primary text-white' },
  draft: { label: 'Borrador', className: 'bg-surface text-ink-2' },
  inactive: { label: 'Inactiva', className: 'bg-surface text-muted' },
};

/** "$5.000 / mes" or "Por definir". */
export const monthlyText = (p: Pick<PriceVersion, 'monthlyCop'>) => (p.monthlyCop ? `${formatCop(p.monthlyCop)} / mes` : 'Por definir');

/** "3 m $15.000 · 6 m $30.000", "Solo 1 mes" or "Por definir". */
export function packagesShort(p: Pick<PriceVersion, 'packages'>): string {
  if (p.packages.length === 0) return 'Por definir';
  if (p.packages.length === 1 && p.packages[0].months === 1) return 'Solo 1 mes';
  return [...p.packages].sort((a, b) => a.months - b.months).map((x) => `${x.months} m ${formatCop(x.amountCop)}`).join(' · ');
}

const subs = (n: number) => (n === 1 ? '1 suscripción' : `${n} suscripciones`);

/** Detail line of the price cards on the subscriptions screen. */
export function packagesLong(p: PriceVersion & { subscriptions: number }): string {
  if (p.packages.length === 0) return p.status === 'draft' ? 'Borrador: define el precio y los paquetes antes de activarla.' : 'Sin paquetes.';
  if (p.packages.length === 1 && p.packages[0].months === 1) return `Pago mes a mes. ${p.subscriptions ? subs(p.subscriptions) : 'Sin suscripciones'}.`;
  const list = [...p.packages].sort((a, b) => a.months - b.months).map((x) => `${x.months} ${x.months === 1 ? 'mes' : 'meses'} ${formatCop(x.amountCop)}`).join(' · ');
  return `${list}. ${p.subscriptions ? `Congelado para ${subs(p.subscriptions)}` : 'Sin suscripciones todavía'}.`;
}

/** Amount suggested for a manual payment of `months`. */
export function suggestedAmount(price: PriceVersion, months: number): number | null {
  const pkg = price.packages.find((x) => x.months === months);
  if (pkg) return pkg.amountCop;
  return price.monthlyCop ? price.monthlyCop * months : null;
}
