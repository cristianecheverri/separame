import { describe, expect, it } from 'vitest';
import {
  isValidReferralCode, qualifiesForReferralReward, referralCodeBase, referralCodeCandidates, referralLinkLabel,
  referralRewardOutcome, referralState, referralUrl,
} from './referrals';
import type { Payment } from './types';

const NOW = new Date('2026-10-20T15:00:00.000Z');
const paid = (overrides: Partial<Payment> = {}) => ({
  status: 'approved', source: 'admin', method: 'nequi', months: 3, amountCop: 15000, ...overrides,
}) as Pick<Payment, 'status' | 'source' | 'method' | 'months' | 'amountCop'>;

describe('qualifiesForReferralReward', () => {
  it('counts an approved payment of at least one month with real money', () => {
    expect(qualifiesForReferralReward(paid())).toBe(true);
    expect(qualifiesForReferralReward(paid({ months: 1, amountCop: 5900, method: 'transfer', source: 'pro_notice' }))).toBe(true);
  });

  it('never counts courtesy, referral months, pending/rejected notices, zero months or zero money', () => {
    expect(qualifiesForReferralReward(paid({ method: 'courtesy', amountCop: null }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ source: 'referral', method: 'courtesy', amountCop: 0, months: 1 }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ status: 'pending' }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ status: 'rejected' }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ months: null }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ months: 0 }))).toBe(false);
    expect(qualifiesForReferralReward(paid({ amountCop: 0 }))).toBe(false);
  });
});

describe('referralRewardOutcome', () => {
  it('adds one month at the end of the paid period', () => {
    expect(referralRewardOutcome({ trialEndsAt: '2026-07-01T00:00:00.000Z', paidUntil: '2027-01-25T05:00:00.000Z', priceVersionId: 'p' }, NOW))
      .toEqual({ kind: 'applied', previousUntil: '2027-01-25T05:00:00.000Z', paidUntil: '2027-02-25T05:00:00.000Z' });
  });

  it('adds it after the trial when the referrer never paid', () => {
    expect(referralRewardOutcome({ trialEndsAt: '2026-10-25T00:00:00.000Z', paidUntil: null, priceVersionId: 'p' }, NOW))
      .toEqual({ kind: 'applied', previousUntil: '2026-10-25T00:00:00.000Z', paidUntil: '2026-11-25T00:00:00.000Z' });
  });

  it('still applies during the grace days (the agenda is open) but saves it once expired', () => {
    expect(referralRewardOutcome({ trialEndsAt: '2026-07-01T00:00:00.000Z', paidUntil: '2026-10-19T00:00:00.000Z', priceVersionId: 'p' }, NOW).kind).toBe('applied');
    expect(referralRewardOutcome({ trialEndsAt: '2026-07-01T00:00:00.000Z', paidUntil: '2026-10-10T00:00:00.000Z', priceVersionId: 'p' }, NOW)).toEqual({ kind: 'saved' });
  });
});

describe('referral codes and links', () => {
  it('derives the code from the slug without honorifics', () => {
    expect(referralCodeBase('dra-laura-perez')).toBe('laura-perez');
    expect(referralCodeBase('estudio-lua')).toBe('estudio-lua');
    expect(referralCodeBase('dr-ana')).toBe('ana');
    expect(referralCodeBase('dra')).toBe('dra');
    expect(referralCodeBase('psic-a')).toBe('psic-a');
    expect(referralCodeBase('a'.repeat(40)).length).toBe(30);
  });

  it('offers numbered then random alternatives, all valid', () => {
    const list = referralCodeCandidates('laura-perez', () => 'x1y2z');
    expect(list).toEqual(['laura-perez', 'laura-perez-2', 'laura-perez-3', 'laura-perez-4', 'laura-perez-5', 'laura-perez-x1y2z']);
    expect(referralCodeCandidates('b'.repeat(30), () => 'abcde').every(isValidReferralCode)).toBe(true);
  });

  it('validates the code shape', () => {
    expect(isValidReferralCode('laura-perez')).toBe(true);
    for (const bad of ['', 'ab', '-ab', 'ab-', 'a--b', 'Laura', 'a/b', 'x'.repeat(31)]) expect(isValidReferralCode(bad), bad).toBe(false);
  });

  it('builds the link and its label', () => {
    const url = referralUrl('https://separame.app/', 'laura-perez');
    expect(url).toBe('https://separame.app/r/laura-perez');
    expect(referralLinkLabel(url)).toBe('separame.app/r/laura-perez');
  });
});

describe('referralState', () => {
  it('splits registered into trial / no payment by the trial end', () => {
    expect(referralState({ state: 'registered', trialEndsAt: '2026-10-25T00:00:00.000Z' }, NOW)).toBe('trial');
    expect(referralState({ state: 'registered', trialEndsAt: '2026-10-01T00:00:00.000Z' }, NOW)).toBe('no_payment');
    expect(referralState({ state: 'saved', trialEndsAt: '2026-10-01T00:00:00.000Z' }, NOW)).toBe('saved');
    expect(referralState({ state: 'rewarded', trialEndsAt: '2026-10-25T00:00:00.000Z' }, NOW)).toBe('rewarded');
  });
});
