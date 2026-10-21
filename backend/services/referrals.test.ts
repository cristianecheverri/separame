import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualPaymentRequest } from '../../shared/api';
import type { AuthUser } from '../lib/auth';
import { priceKey, profileKey, refCodeKey, refSignupKey, subKey } from '../lib/keys';
import { sha256Hex } from '../lib/tokens';
import { canceledTx, profile, setTestEnv, subItem } from '../testing/fixtures';
import { recordManualPayment } from './payments';
import { DEFAULT_PRICE_SEEDS } from './prices';
import {
  adminReferralInfo, ensureReferralCode, myReferrals, publicReferral, rememberSignupCode, resolveOnboardingReferral, type ReferralRecord,
} from './referrals';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const NOW = new Date('2026-10-20T15:00:00.000Z');
const admin: AuthUser = { sub: 'admin-sub', email: 'admin@separame.app', groups: ['admin'], isAdmin: true };

const REFERRER = 'referrer0000001';
const PAYER = 'payer00000000001';
const referrerSub = (overrides = {}) => subItem({
  proId: REFERRER, name: 'Dra. Laura Pérez', email: 'laura@correo.com', slug: 'dra-laura-perez', referralCode: 'laura-perez',
  trialEndsAt: '2026-07-01T00:00:00.000Z', paidUntil: '2027-01-25T05:00:00.000Z', updatedAt: '2026-09-25T00:00:00.000Z', ...overrides,
});
const payerSub = (overrides = {}) => subItem({
  proId: PAYER, name: 'Nombre del referido', title: 'Abogado', email: 'referido@correo.com', slug: 'referido',
  trialEndsAt: '2026-10-25T00:00:00.000Z', referredBy: { proId: REFERRER, code: 'laura-perez' }, ...overrides,
});
const pay: ManualPaymentRequest = { method: 'nequi', amountCop: 15000, paidAt: '2026-10-20', period: { months: 3 }, reference: '', notify: false };

const referralQuery = (proId: string) => ({ ExpressionAttributeValues: { ':pk': `PRO#${proId}`, ':p': 'REFERRAL#' } });
const savedRecord: ReferralRecord = {
  referredProId: 'saved0000000001', name: 'Nombre del referido guardado', title: 'Tutorías', registeredAt: '2026-10-01T00:00:00.000Z',
  trialEndsAt: '2026-10-11T00:00:00.000Z', state: 'saved', paidMonths: 3, paidAt: '2026-10-19T17:00:00.000Z', rewardedAt: '2026-10-19T17:00:00.000Z',
};

beforeEach(() => {
  ddb.reset();
  ses.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: priceKey('fundador-v1') }).resolves({ Item: { ...DEFAULT_PRICE_SEEDS[0], createdAt: NOW.toISOString() } });
  ddb.on(GetCommand, { Key: profileKey(PAYER) }).resolves({ Item: { ...profile, id: PAYER, name: 'Nombre del referido', email: 'referido@correo.com' } });
  ddb.on(GetCommand, { Key: profileKey(REFERRER) }).resolves({ Item: { ...profile, id: REFERRER } });
  ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub() });
  ddb.on(GetCommand, { Key: subKey(PAYER) }).resolves({ Item: payerSub() });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(PutCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
});

const txCalls = () => ddb.commandCalls(TransactWriteCommand).map((c) => c.args[0].input.TransactItems!);
const lastTx = () => txCalls().at(-1)!;
const subjects = () => ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Content!.Simple!.Subject!.Data);

describe('referral reward on the referred account’s first qualifying payment', () => {
  it('adds one month at the end of the referrer’s period, audited as "Mes gratis por referido", in the same transaction', async () => {
    const res = await recordManualPayment(admin, PAYER, pay, NOW);
    expect(res).not.toHaveProperty('referralCredit');
    const ops = lastTx();
    expect(ops).toHaveLength(6);
    expect(ops[0].Update!.UpdateExpression).toContain('referralRewardedAt = :rr');
    expect(ops[2].Put!).toMatchObject({ Item: { PK: `REFREWARD#${PAYER}`, referrerProId: REFERRER }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(ops[3].Put!.Item).toMatchObject({ PK: `PRO#${REFERRER}`, SK: `REFERRAL#${PAYER}`, state: 'rewarded', paidMonths: 3 });
    expect(ops[4].Update!).toMatchObject({ Key: subKey(REFERRER), ConditionExpression: 'updatedAt = :prev' });
    expect(ops[4].Update!.ExpressionAttributeValues![':pu']).toBe('2027-02-25T05:00:00.000Z');
    expect(ops[5].Put!.Item).toMatchObject({
      PK: `PRO#${REFERRER}`, proId: REFERRER, source: 'referral', method: 'courtesy', status: 'approved', amountCop: 0, months: 1,
      until: '2027-02-25T05:00:00.000Z',
      referral: { referredProId: PAYER, referredName: 'Nombre del referido', previousUntil: '2027-01-25T05:00:00.000Z' },
    });
    expect(subjects()).toEqual(['¡Ganaste un mes gratis! · Tu plan ahora vence el 25 feb. 2027']);
    expect(ses.commandCalls(SendEmailCommand)[0].args[0].input.Destination!.ToAddresses).toEqual(['laura@correo.com']);
  });

  it('approving a "Ya pagué" notice goes through the same path', async () => {
    const notice = {
      id: 'notice1', proId: PAYER, method: 'transfer', status: 'pending', source: 'pro_notice', amountCop: 15000, months: 3,
      paidAt: '2026-10-19T20:00:00.000Z', until: null, reference: 'M1', priceVersionId: 'fundador-v1', createdAt: '2026-10-19T20:00:00.000Z',
    };
    ddb.on(QueryCommand, { ExpressionAttributeValues: { ':pk': `PRO#${PAYER}`, ':p': 'PAY#' } }).resolves({ Items: [{ PK: `PRO#${PAYER}`, SK: 'PAY#x', ...notice }] });
    await recordManualPayment(admin, PAYER, { ...pay, method: 'transfer', noticeId: 'notice1' }, NOW);
    const ops = lastTx();
    expect(ops[2].Put!.Item!.PK).toBe(`REFREWARD#${PAYER}`);
    expect(ops[0].Update!.UpdateExpression).toContain('REMOVE pendingNoticeId');
  });

  it('a courtesy payment does not qualify', async () => {
    await recordManualPayment(admin, PAYER, { ...pay, method: 'courtesy', amountCop: null }, NOW);
    expect(lastTx()).toHaveLength(2);
    expect(subjects()).toEqual([]);
  });

  it('an exact-date payment (no months) does not qualify', async () => {
    await recordManualPayment(admin, PAYER, { ...pay, period: { until: '2026-12-31' } }, NOW);
    expect(lastTx()).toHaveLength(2);
  });

  it('a second payment does not reward again', async () => {
    ddb.on(GetCommand, { Key: subKey(PAYER) }).resolves({ Item: payerSub({ referralRewardedAt: '2026-10-01T00:00:00.000Z' }) });
    await recordManualPayment(admin, PAYER, pay, NOW);
    expect(lastTx()).toHaveLength(2);
    expect(lastTx()[0].Update!.UpdateExpression).not.toContain('referralRewardedAt');
  });

  it('a replay that hits the reward marker commits the payment once, without rewarding twice', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(canceledTx(['None', 'None', 'ConditionalCheckFailed', 'None', 'None', 'None'])).resolves({});
    await recordManualPayment(admin, PAYER, pay, NOW);
    const calls = txCalls();
    expect(calls).toHaveLength(2);
    expect(calls[1]).toHaveLength(2);
    expect(subjects()).toEqual([]);
  });

  it('retries when the referrer’s subscription changed concurrently', async () => {
    ddb.on(TransactWriteCommand).rejectsOnce(canceledTx(['None', 'None', 'None', 'None', 'ConditionalCheckFailed', 'None'])).resolves({});
    await recordManualPayment(admin, PAYER, pay, NOW);
    expect(txCalls()).toHaveLength(2);
    expect(txCalls()[1]).toHaveLength(6);
  });

  it('an expired referrer gets the month SAVED: no plan change, no payment yet, the "guardado" email', async () => {
    ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub({ paidUntil: '2026-10-01T00:00:00.000Z' }) });
    ddb.on(QueryCommand, referralQuery(REFERRER)).resolves({ Items: [{ ...savedRecord, referredProId: PAYER }] });
    await recordManualPayment(admin, PAYER, pay, NOW);
    const ops = lastTx();
    expect(ops).toHaveLength(4);
    expect(ops[3].Put!.Item).toMatchObject({ SK: `REFERRAL#${PAYER}`, state: 'saved' });
    expect(ops.some((op) => op.Update?.Key?.PK === `PRO#${REFERRER}`)).toBe(false);
    expect(subjects()).toEqual(['¡Ganaste un mes gratis! · Lo guardamos para tu próximo pago']);
  });

  it('saved months are added after the referrer’s next approved payment, each audited, and flipped conditionally', async () => {
    ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub({ paidUntil: '2026-10-01T00:00:00.000Z' }) });
    ddb.on(QueryCommand, referralQuery(REFERRER)).resolves({ Items: [{ PK: `PRO#${REFERRER}`, SK: 'REFERRAL#saved0000000001', ...savedRecord }] });
    const res = await recordManualPayment(admin, REFERRER, pay, NOW);
    // 3 months from today (expired) = 2027-01-20, + 1 saved month = 2027-02-20.
    expect(res.payment.until).toBe('2027-01-20T15:00:00.000Z');
    expect(res.subscription.paidUntil).toBe('2027-02-20T15:00:00.000Z');
    const ops = lastTx();
    expect(ops).toHaveLength(4);
    expect(ops[0].Update!.ExpressionAttributeValues![':pu']).toBe('2027-02-20T15:00:00.000Z');
    expect(ops[2].Put!.Item).toMatchObject({
      source: 'referral', amountCop: 0, months: 1, until: '2027-02-20T15:00:00.000Z',
      referral: { referredProId: 'saved0000000001', referredName: 'Nombre del referido guardado', previousUntil: '2027-01-20T15:00:00.000Z' },
    });
    expect(ops[3].Update!).toMatchObject({ ConditionExpression: '#st = :saved', ExpressionAttributeValues: { ':rewarded': 'rewarded', ':saved': 'saved' } });
  });

  it('never rewards a self-referral that slipped into the subscription', async () => {
    ddb.on(GetCommand, { Key: subKey(PAYER) }).resolves({ Item: payerSub({ referredBy: { proId: PAYER, code: 'yo' } }) });
    await recordManualPayment(admin, PAYER, pay, NOW);
    expect(lastTx()).toHaveLength(2);
  });
});

describe('attribution at onboarding', () => {
  beforeEach(() => {
    ddb.on(GetCommand, { Key: refCodeKey('laura-perez') }).resolves({ Item: { proId: REFERRER } });
  });

  it('resolves a valid code of another professional', async () => {
    expect(await resolveOnboardingReferral({ email: 'nuevo@correo.com', referralCode: 'laura-perez', trialUsed: false }))
      .toEqual({ referrerProId: REFERRER, code: 'laura-perez' });
  });

  it('falls back to the code the pre sign-up trigger saved for this email', async () => {
    ddb.on(GetCommand, { Key: refSignupKey(sha256Hex('nuevo@correo.com')) }).resolves({ Item: { code: 'laura-perez' } });
    expect(await resolveOnboardingReferral({ email: 'Nuevo@correo.com', trialUsed: false })).toEqual({ referrerProId: REFERRER, code: 'laura-perez' });
  });

  it('rejects self-referrals, accounts that already had a trial and unknown or malformed codes', async () => {
    expect(await resolveOnboardingReferral({ email: 'LAURA@correo.com', referralCode: 'laura-perez', trialUsed: false })).toBeNull();
    expect(await resolveOnboardingReferral({ email: 'nuevo@correo.com', referralCode: 'laura-perez', trialUsed: true })).toBeNull();
    expect(await resolveOnboardingReferral({ email: 'nuevo@correo.com', referralCode: 'otro-codigo', trialUsed: false })).toBeNull();
    expect(await resolveOnboardingReferral({ email: 'nuevo@correo.com', referralCode: '../x', trialUsed: false })).toBeNull();
    expect(await resolveOnboardingReferral({ email: 'nuevo@correo.com', trialUsed: false })).toBeNull();
  });
});

describe('referral codes', () => {
  it('creates the code from the slug, reserving it with a conditional put', async () => {
    ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub({ referralCode: undefined }) });
    expect(await ensureReferralCode(REFERRER, NOW)).toBe('laura-perez');
    const [put, update] = lastTx();
    expect(put.Put!).toMatchObject({ Item: { PK: 'REFCODE#laura-perez', proId: REFERRER }, ConditionExpression: 'attribute_not_exists(PK)' });
    expect(update.Update!.ConditionExpression).toBe('attribute_exists(PK) AND attribute_not_exists(referralCode)');
  });

  it('tries the next candidate when the code is taken', async () => {
    ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub({ referralCode: undefined }) });
    ddb.on(TransactWriteCommand).rejectsOnce(canceledTx(['ConditionalCheckFailed', 'None'])).resolves({});
    expect(await ensureReferralCode(REFERRER, NOW)).toBe('laura-perez-2');
  });

  it('keeps an existing code (immutable, even after slug changes)', async () => {
    ddb.on(GetCommand, { Key: subKey(REFERRER) }).resolves({ Item: referrerSub({ slug: 'otro-enlace' }) });
    expect(await ensureReferralCode(REFERRER, NOW)).toBe('laura-perez');
    expect(txCalls()).toHaveLength(0);
  });

  it('resolves the public "Te invitó …" name, 404 for unknown codes', async () => {
    ddb.on(GetCommand, { Key: refCodeKey('laura-perez') }).resolves({ Item: { proId: REFERRER } });
    expect(await publicReferral('Laura-Perez')).toEqual({ code: 'laura-perez', name: 'Dra. Laura Pérez', initials: 'LP' });
    await expect(publicReferral('nadie-aqui')).rejects.toMatchObject({ code: 'not_found' });
    await expect(publicReferral('<x>')).rejects.toMatchObject({ code: 'not_found' });
  });

  it('remembers a sign-up code with a TTL; ignores malformed ones', async () => {
    expect(await rememberSignupCode('Nuevo@correo.com', 'laura-perez', NOW)).toBe(true);
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item).toMatchObject({ ...refSignupKey(sha256Hex('nuevo@correo.com')), code: 'laura-perez' });
    expect(item.ttl).toBeGreaterThan(NOW.getTime() / 1000);
    expect(await rememberSignupCode('nuevo@correo.com', 'x', NOW)).toBe(false);
  });
});

describe('referral summaries', () => {
  const records = [
    { PK: `PRO#${REFERRER}`, SK: 'REFERRAL#a', ...savedRecord, referredProId: 'a', state: 'rewarded', registeredAt: '2026-09-01T00:00:00.000Z' },
    { PK: `PRO#${REFERRER}`, SK: 'REFERRAL#b', ...savedRecord, referredProId: 'b', registeredAt: '2026-10-02T00:00:00.000Z' },
    { PK: `PRO#${REFERRER}`, SK: 'REFERRAL#c', ...savedRecord, referredProId: 'c', state: 'registered', trialEndsAt: '2026-10-25T00:00:00.000Z', paidMonths: null, paidAt: null, registeredAt: '2026-10-15T00:00:00.000Z' },
    { PK: `PRO#${REFERRER}`, SK: 'REFERRAL#d', ...savedRecord, referredProId: 'd', state: 'registered', trialEndsAt: '2026-09-30T00:00:00.000Z', paidMonths: null, paidAt: null, registeredAt: '2026-09-20T00:00:00.000Z' },
  ];

  it('counts months earned (applied + saved) and lists people newest first with their state', async () => {
    ddb.on(QueryCommand, referralQuery(REFERRER)).resolves({ Items: records });
    const summary = await myReferrals(REFERRER, NOW);
    expect(summary).toMatchObject({ code: 'laura-perez', url: 'https://dev.separame.app/r/laura-perez', monthsEarned: 2, monthsApplied: 1, monthsPending: 1 });
    expect(summary.referrals.map((r) => [r.referredProId, r.state])).toEqual([['c', 'trial'], ['b', 'saved'], ['d', 'no_payment'], ['a', 'rewarded']]);
  });

  it('tells the admin who referred whom', async () => {
    const info = await adminReferralInfo(payerSub(), NOW);
    expect(info.referredBy).toEqual({ proId: REFERRER, code: 'laura-perez', name: 'Dra. Laura Pérez' });
    expect(info.referrals).toMatchObject({ code: null, url: null, monthsEarned: 0, referrals: [] });
  });
});
