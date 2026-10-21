/**
 * Mock mode data for the referral program (boards referral-*): Laura's link and the people she
 * invited (per ?state=), the public "Te invitó …" lookup, and the admin view of Estudio Lúa
 * (referred by Laura, with referrals of her own). Registered on the mock API by mockApi.ts.
 */
import type { AdminProDetailResponse, PublicReferralResponse, ReferralsResponse } from '@shared/api';
import type { Payment, Referral } from '@shared/types';
import type { MockState } from './fixtures';

const SITE = 'https://separame.app';

const person = (p: Omit<Referral, 'paidMonths' | 'paidAt'> & Partial<Pick<Referral, 'paidMonths' | 'paidAt'>>): Referral => ({ paidMonths: null, paidAt: null, ...p });

const andres = person({ referredProId: 'pro-andres', name: 'Andrés Restrepo', title: 'Abogado', registeredAt: '2026-10-15T15:00:00.000Z', trialEndsAt: '2026-10-25T15:00:00.000Z', state: 'trial' });
const camilo = person({ referredProId: 'pro-camilo', name: 'Camilo Arango', title: 'Entrenador', registeredAt: '2026-10-01T15:00:00.000Z', trialEndsAt: '2026-10-11T15:00:00.000Z', state: 'rewarded', paidMonths: 6, paidAt: '2026-10-14T15:00:00.000Z' });
const lua = person({ referredProId: 'pro-lua', name: 'Estudio Lúa', title: 'Estética', registeredAt: '2026-07-11T15:00:00.000Z', trialEndsAt: '2026-07-18T15:00:00.000Z', state: 'rewarded', paidMonths: 3, paidAt: '2026-10-02T15:00:00.000Z' });
const felipe = person({ referredProId: 'pro-felipe', name: 'Felipe Mora', title: 'Tutorías', registeredAt: '2026-10-05T15:00:00.000Z', trialEndsAt: '2026-10-15T15:00:00.000Z', state: 'saved', paidMonths: 3, paidAt: '2026-10-19T15:00:00.000Z' });

const reward = (id: string, proId: string, referred: Referral, at: string, previousUntil: string, until: string): Payment => ({
  id, proId, method: 'courtesy', status: 'approved', source: 'referral', amountCop: 0, months: 1, paidAt: at, until, reference: '',
  priceVersionId: 'price-fundador', referral: { referredProId: referred.referredProId, referredName: referred.name, previousUntil }, createdAt: at,
});

function summary(code: string, referrals: Referral[]): ReferralsResponse {
  const monthsApplied = referrals.filter((r) => r.state === 'rewarded').length;
  const monthsPending = referrals.filter((r) => r.state === 'saved').length;
  return { code, url: `${SITE}/r/${code}`, monthsEarned: monthsApplied + monthsPending, monthsApplied, monthsPending, referrals };
}

/** Laura's referral summary and the "Mes gratis por referido" rows of her history, per mock state. */
export function lauraReferrals(state: MockState): { summary: ReferralsResponse; payments: Payment[] } {
  if (state === 'trial' || state === 'onboarding') return { summary: summary('laura-perez', [andres]), payments: [] };
  if (state === 'expired') return { summary: summary('laura-perez', [felipe, andres, camilo, lua]), payments: [] };
  return {
    summary: summary('laura-perez', [andres, camilo, lua]),
    payments: [
      reward('pay-ref-camilo', 'pro-laura', camilo, '2026-10-14T15:00:00.000Z', '2026-12-14T14:00:00.000Z', '2027-01-14T14:00:00.000Z'),
      reward('pay-ref-lua', 'pro-laura', lua, '2026-10-02T15:00:00.000Z', '2026-11-14T14:00:00.000Z', '2026-12-14T14:00:00.000Z'),
    ],
  };
}

const parche = person({ referredProId: 'pro-parche', name: 'Barbería El Parche', title: 'Barbería', registeredAt: '2026-08-20T15:00:00.000Z', trialEndsAt: '2026-08-30T15:00:00.000Z', state: 'rewarded', paidMonths: 3, paidAt: '2026-09-02T15:00:00.000Z' });
const valentina = person({ referredProId: 'pro-valentina', name: 'Valentina Yoga', title: 'Yoga', registeredAt: '2026-10-18T15:00:00.000Z', trialEndsAt: '2026-10-28T15:00:00.000Z', state: 'trial' });
const sofia = person({ referredProId: 'pro-sofia', name: 'Sofía Uñas', title: 'Uñas', registeredAt: '2026-09-20T15:00:00.000Z', trialEndsAt: '2026-09-30T15:00:00.000Z', state: 'no_payment' });

/** Admin pro detail: who referred them and their own referrals. */
export function adminReferrals(proId: string): Pick<AdminProDetailResponse, 'referredBy' | 'referrals'> {
  if (proId === 'pro-lua') {
    const s = summary('estudio-lua', [parche, valentina, sofia]);
    return { referredBy: { proId: 'pro-laura', name: 'Dra. Laura Pérez', code: 'laura-perez' }, referrals: s };
  }
  return { referredBy: null, referrals: { code: null, url: null, monthsEarned: 0, monthsApplied: 0, monthsPending: 0, referrals: [] } };
}

/** "Mes gratis por referido" row of Estudio Lúa's history (admin). */
export const luaReferralPayments: Payment[] = [
  reward('pay-ref-parche', 'pro-lua', parche, '2026-09-02T15:00:00.000Z', '2026-09-18T14:00:00.000Z', '2026-10-18T14:00:00.000Z'),
];

/** Codes the signup page can resolve in mock mode (/app/signup?ref=laura-perez). */
export const PUBLIC_REFERRALS: Record<string, PublicReferralResponse> = {
  'laura-perez': { code: 'laura-perez', name: 'Dra. Laura Pérez', initials: 'LP' },
  'estudio-lua': { code: 'estudio-lua', name: 'Estudio Lúa', initials: 'EL' },
};
