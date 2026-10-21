/** Spanish labels for payments (billing history, admin tables). */
import type { Payment, PaymentMethod, PaymentStatus } from '@shared/types';

export const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: 'Transferencia',
  nequi: 'Nequi directo',
  cash: 'Efectivo',
  courtesy: 'Cortesía',
  card: 'Tarjeta',
  pse: 'PSE',
};

export const STATUS_LABEL: Record<PaymentStatus, string> = {
  approved: 'Aprobado',
  pending: 'En revisión',
  rejected: 'Rechazado',
};

const PROVIDER_LABEL = { nequi: 'Nequi', wompi: 'Wompi', mercadopago: 'Mercado Pago' } as const;

/** "Manual · Transferencia", "Aviso · Nequi directo", "Nequi · PSE" (future gateways). */
export function paymentTitle(p: Pick<Payment, 'method' | 'source' | 'gateway'>): string {
  if (p.source === 'gateway' && p.gateway) return `${PROVIDER_LABEL[p.gateway.provider]} · ${METHOD_LABEL[p.method]}`;
  if (p.source === 'pro_notice') return `Aviso · ${METHOD_LABEL[p.method]}`;
  return `Manual · ${METHOD_LABEL[p.method]}`;
}

export function paymentDot(p: Pick<Payment, 'status' | 'source'>): string {
  if (p.status === 'rejected') return 'bg-warn';
  if (p.status === 'pending') return 'bg-accent';
  return p.source === 'admin' ? 'bg-accent-deep' : 'bg-primary';
}

export const isPendingNotice = (p: Payment) => p.status === 'pending' && p.source === 'pro_notice';
