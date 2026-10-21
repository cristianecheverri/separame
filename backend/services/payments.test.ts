import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ManualPaymentRequest } from '../../shared/api';
import type { Payment } from '../../shared/types';
import type { AuthUser } from '../lib/auth';
import { clearParamCache } from '../lib/ssm';
import { priceKey, profileKey, subKey } from '../lib/keys';
import { canceledTx, PRO_ID, profile, setTestEnv, subItem } from '../testing/fixtures';
import { DEFAULT_PRICE_SEEDS } from './prices';
import {
  createPaymentNotice, endOfBogotaDay, getPaymentInstructions, recordManualPayment, rejectPaymentNotice,
} from './payments';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const ssm = mockClient(SSMClient);
const NOW = new Date('2026-10-20T15:00:00.000Z');
const admin: AuthUser = { sub: 'admin-sub', email: 'admin@separame.app', groups: ['admin'], isAdmin: true };
const base: Omit<ManualPaymentRequest, 'period'> = { method: 'transfer', amountCop: 15000, paidAt: '2026-10-20', reference: 'Bancolombia #482913', notify: false };

const notice: Payment = {
  id: 'notice1', proId: PRO_ID, method: 'nequi', status: 'pending', source: 'pro_notice', amountCop: 15000, months: 3,
  paidAt: '2026-10-19T20:00:00.000Z', until: null, reference: 'M12345', priceVersionId: 'fundador-v1', createdAt: '2026-10-19T20:00:00.000Z',
};
const noticeItem = { PK: `PRO#${PRO_ID}`, SK: `PAY#${notice.createdAt}#${notice.id}`, ...notice };

beforeEach(() => {
  ddb.reset();
  ses.reset();
  ssm.reset();
  clearParamCache();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(GetCommand, { Key: priceKey('fundador-v1') }).resolves({ Item: { ...DEFAULT_PRICE_SEEDS[0], createdAt: NOW.toISOString() } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(TransactWriteCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
});

const tx = () => ddb.commandCalls(TransactWriteCommand).at(-1)!.args[0].input.TransactItems!;

describe('recordManualPayment', () => {
  it('+N months on an expired plan counts from today', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2026-10-11T00:00:00.000Z', paidUntil: '2026-10-18T00:00:00.000Z' }) });
    const res = await recordManualPayment(admin, PRO_ID, { ...base, period: { months: 3 } }, NOW);
    expect(res.payment).toMatchObject({
      method: 'transfer', status: 'approved', source: 'admin', amountCop: 15000, months: 3, until: '2027-01-20T15:00:00.000Z',
      priceVersionId: 'fundador-v1', recordedBy: { sub: 'admin-sub', email: 'admin@separame.app' },
    });
    expect(res.subscription.state).toBe('active');
    expect(tx()[0].Update!.ExpressionAttributeValues![':pu']).toBe('2027-01-20T15:00:00.000Z');
    expect(tx()[1].Put!.Item!.GSI1PK).toBe('PAYMENTS#2026-10');
    expect(tx()[1].Put!.ConditionExpression).toBe('attribute_not_exists(PK)');
  });

  it('+N months on an active plan counts from its end', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ paidUntil: '2026-12-01T05:00:00.000Z' }) });
    const res = await recordManualPayment(admin, PRO_ID, { ...base, period: { months: 6 } }, NOW);
    expect(res.payment.until).toBe('2027-06-01T05:00:00.000Z');
  });

  it('an exact date ends at the end of that Bogotá day; courtesy has no amount', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    const res = await recordManualPayment(admin, PRO_ID, { ...base, method: 'courtesy', amountCop: null, period: { until: '2026-12-31' } }, NOW);
    expect(res.payment.until).toBe('2027-01-01T04:59:59.999Z');
    expect(res.payment.until).toBe(endOfBogotaDay('2026-12-31'));
    expect(res.payment.amountCop).toBeNull();
    expect(res.payment.months).toBeNull();
  });

  it('retries when the subscription changed concurrently', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    ddb.on(TransactWriteCommand).rejectsOnce(canceledTx(['ConditionalCheckFailed', 'None'])).resolves({});
    await recordManualPayment(admin, PRO_ID, { ...base, period: { months: 3 } }, NOW);
    expect(ddb.commandCalls(TransactWriteCommand)).toHaveLength(2);
  });

  it('rejects a past exact date', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    await expect(recordManualPayment(admin, PRO_ID, { ...base, period: { until: '2026-10-01' } }, NOW)).rejects.toMatchObject({ code: 'validation' });
  });

  it('approving a notice turns that pending item into the approved payment and clears the flag', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ pendingNoticeId: 'notice1' }) });
    ddb.on(QueryCommand).resolves({ Items: [noticeItem] });
    const res = await recordManualPayment(admin, PRO_ID, { ...base, method: 'nequi', reference: '', noticeId: 'notice1', period: { months: 3 } }, NOW);
    expect(res.payment).toMatchObject({
      id: 'notice1', status: 'approved', source: 'pro_notice', reference: 'M12345', until: '2027-01-25T00:00:00.000Z',
      reviewedBy: { sub: 'admin-sub', email: 'admin@separame.app' }, reviewedAt: NOW.toISOString(),
    });
    expect(res.payment.recordedBy).toBeUndefined();
    const [subUpdate, put] = tx();
    expect(subUpdate.Update!.UpdateExpression).toContain('REMOVE pendingNoticeId');
    expect(put.Put!.Item).toMatchObject({ SK: noticeItem.SK, status: 'approved', GSI1PK: 'PAYMENTS#2026-10' });
    expect(put.Put!.ConditionExpression).toBe('#st = :pending');
  });

  it('refuses to approve a notice that was already reviewed', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    ddb.on(QueryCommand).resolves({ Items: [{ ...noticeItem, status: 'rejected' }] });
    await expect(recordManualPayment(admin, PRO_ID, { ...base, noticeId: 'notice1', period: { months: 3 } }, NOW)).rejects.toMatchObject({ code: 'conflict' });
  });
});

describe('"Ya pagué" notices', () => {
  it('creates a pending notice priced from the package — even when expired — and alerts admin + pro', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ trialEndsAt: '2026-09-01T00:00:00.000Z' }) });
    const payment = await createPaymentNotice(PRO_ID, { months: 6, method: 'nequi', reference: 'M999' }, NOW);
    expect(payment).toMatchObject({ status: 'pending', source: 'pro_notice', amountCop: 30000, months: 6, until: null, method: 'nequi' });
    const [put, sub] = tx();
    expect(put.Put!.Item!.GSI1PK).toBeUndefined();
    expect(sub.Update!.ConditionExpression).toBe('attribute_exists(PK) AND attribute_not_exists(pendingNoticeId)');
    const recipients = ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Destination!.ToAddresses![0]);
    expect(recipients.sort()).toEqual(['laura@correo.com', 'ops@separame.app']);
    const subjects = ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Content!.Simple!.Subject!.Data);
    expect(subjects).toContain('Nuevo aviso de pago · Dra. Laura Pérez · Fundador');
    expect(subjects).toContain('Recibimos tu aviso de pago');
  });

  it('allows only one pending notice (409 conflict)', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem({ pendingNoticeId: 'notice1' }) });
    await expect(createPaymentNotice(PRO_ID, { months: 3, method: 'nequi', reference: '' }, NOW)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('validates months against the plan packages', async () => {
    ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
    await expect(createPaymentNotice(PRO_ID, { months: 5, method: 'transfer', reference: '' }, NOW)).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejecting records the reason/reviewer, clears the flag and emails the pro', async () => {
    ddb.on(QueryCommand).resolves({ Items: [noticeItem] });
    const res = await rejectPaymentNotice(admin, PRO_ID, 'notice1', 'No vemos la transferencia', NOW);
    expect(res).toMatchObject({ status: 'rejected', rejectReason: 'No vemos la transferencia', reviewedBy: { sub: 'admin-sub' } });
    const [update, sub] = tx();
    expect(update.Update!.ConditionExpression).toBe('#st = :pending');
    expect(sub.Update!.UpdateExpression).toBe('REMOVE pendingNoticeId');
    const email = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(email.Content!.Simple!.Subject!.Data).toBe('No pudimos confirmar tu pago');
    expect(email.Content!.Simple!.Body!.Html!.Data).toContain('No vemos la transferencia');
  });
});

describe('payment instructions', () => {
  it('parses the SSM JSON and returns null when missing or invalid', async () => {
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: JSON.stringify({ methods: [{ kind: 'nequi', label: 'Nequi', detail: '300 123 4567' }], holderName: 'Sepárame SAS' }) } });
    expect(await getPaymentInstructions()).toEqual({ methods: [{ kind: 'nequi', label: 'Nequi', detail: '300 123 4567' }], holderName: 'Sepárame SAS', note: '' });
    clearParamCache();
    ssm.on(GetParameterCommand).resolves({ Parameter: { Value: '{"nope":1}' } });
    expect(await getPaymentInstructions()).toBeNull();
    clearParamCache();
    ssm.on(GetParameterCommand).rejects(Object.assign(new Error('x'), { name: 'ParameterNotFound' }));
    expect(await getPaymentInstructions()).toBeNull();
  });
});
