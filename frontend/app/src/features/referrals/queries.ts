/** react-query hooks for the referral program (kept here so lib/queries.ts stays untouched). */
import { useQuery } from '@tanstack/react-query';
import { apiPaths, type PublicReferralResponse, type ReferralsResponse } from '@shared/api';
import { isValidReferralCode } from '@shared/referrals';
import { api } from '../../lib/api';

export const referralKeys = {
  mine: ['referrals'] as const,
  publicCode: (code: string) => ['referrals', 'public', code] as const,
};

/** GET /me/referrals — the link, months earned and the people invited. */
export const useReferrals = (enabled = true) =>
  useQuery({ queryKey: referralKeys.mine, queryFn: () => api.get<ReferralsResponse>(apiPaths.referrals()), enabled, staleTime: 5 * 60_000 });

/** GET /public/referrals/{code} — "Te invitó …" on the signup page (no session needed). */
export const usePublicReferral = (code: string | null) =>
  useQuery({
    queryKey: referralKeys.publicCode(code ?? ''),
    queryFn: () => api.get<PublicReferralResponse>(apiPaths.publicReferral(code!)),
    enabled: !!code && isValidReferralCode(code),
    staleTime: Infinity,
    retry: false,
  });
