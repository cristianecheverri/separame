/** Spanish copy for referral states, months and history rows (panel + admin), as in the referral boards. */
import { formatDateNoYear, formatDateShort } from '@shared/format';
import { bogotaDate } from '@shared/time';
import type { Payment, Referral, ReferralState } from '@shared/types';

export const monthsText = (n: number) => (n === 1 ? '1 mes' : `${n} meses`);

/** "Has ganado 2 meses". */
export const earnedText = (n: number) => `Has ganado ${monthsText(n)}`;

const badgeBase = 'inline-flex items-center gap-[6px] text-[12px] font-bold py-[6px] px-3 rounded-full leading-[1.3]';

/** The professional's own list (Suscripción → Referidos). */
export const PRO_STATE: Record<ReferralState, { label: string; className: string }> = {
  trial: { label: 'Se registró · en prueba', className: `${badgeBase} bg-accent-soft text-accent-ink` },
  rewarded: { label: 'Pagó · ganaste 1 mes ✓', className: `${badgeBase} bg-primary text-white` },
  saved: { label: 'Mes guardado: se aplica en tu próximo pago', className: `${badgeBase} bg-warn-soft text-warn-ink` },
  no_payment: { label: 'Sin pago', className: `${badgeBase} bg-surface text-ink-2` },
};

const adminBadge = 'text-[12px] font-bold py-[5px] px-[10px] rounded-full whitespace-nowrap';

/** Admin pro detail ("Sus referidos"). */
export const ADMIN_STATE: Record<ReferralState, { label: string; className: string }> = {
  trial: { label: 'Se registró · en prueba', className: `${adminBadge} bg-accent-soft text-accent-ink` },
  rewarded: { label: 'Pagó · ganó 1 mes ✓', className: `${adminBadge} bg-primary text-white` },
  saved: { label: 'Pagó · mes guardado', className: `${adminBadge} bg-warn-soft text-warn-ink` },
  no_payment: { label: 'Sin pago', className: `${adminBadge} bg-surface text-ink-2` },
};

const day = (instant: string) => formatDateNoYear(bogotaDate(instant));
const dayYear = (instant: string) => formatDateShort(bogotaDate(instant));
const paid = (r: Referral) => (r.paidMonths && r.paidAt ? `pagó ${monthsText(r.paidMonths)} el ${day(r.paidAt)}` : 'pagó');

/** "Abogado · se registró el 15 oct. · prueba hasta el 25 oct." / "Entrenador · pagó 6 meses el 14 oct." */
export function proReferralDetail(r: Referral): string {
  const what =
    r.state === 'trial'
      ? `se registró el ${day(r.registeredAt)} · prueba hasta el ${day(r.trialEndsAt)}`
      : r.state === 'no_payment'
        ? `su prueba terminó el ${day(r.trialEndsAt)} sin pago`
        : paid(r);
  return r.title ? `${r.title} · ${what}` : what;
}

/** "Pagó 3 meses el 2 sep. 2026" / "Se registró el 18 oct. 2026" / "Su prueba terminó el 30 sep. sin pago". */
export function adminReferralDetail(r: Referral): string {
  if (r.state === 'trial') return `Se registró el ${dayYear(r.registeredAt)}`;
  if (r.state === 'no_payment') return `Su prueba terminó el ${day(r.trialEndsAt)} sin pago`;
  return r.paidMonths && r.paidAt ? `Pagó ${monthsText(r.paidMonths)} el ${dayYear(r.paidAt)}` : 'Pagó';
}

export const isReferralPayment = (p: Payment) => p.source === 'referral';

/** Pro history: "Mes gratis por referido · Nombre" + "14 oct. 2026 · tu plan pasó del 25 ene. al 25 feb. 2027". */
export function proReferralPaymentRow(p: Payment): { title: string; detail: string } {
  const who = p.referral?.referredName;
  const moved = p.referral && p.until ? ` · tu plan pasó del ${day(p.referral.previousUntil)} al ${dayYear(p.until)}` : '';
  return { title: who ? `Mes gratis por referido · ${who}` : 'Mes gratis por referido', detail: `${dayYear(p.paidAt)}${moved}` };
}

/** Admin history: "2 sep. 2026 · por Nombre · hasta 18 oct. 2026 · automático". */
export function adminReferralPaymentDetail(p: Payment): string {
  return [dayYear(p.paidAt), p.referral ? `por ${p.referral.referredName}` : '', p.until ? `hasta ${dayYear(p.until)}` : '', 'automático'].filter(Boolean).join(' · ');
}
