import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { BatchGetCommand, DynamoDBDocumentClient, GetCommand, QueryCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { ACTING_PRO_HEADER } from '../../shared/api';
import type { AuthUser } from '../lib/auth';
import { ownerKey, priceKey, profileKey, settingsKey, slugKey, subKey, teamKey, teamRequestKey } from '../lib/keys';
import { apiEvent, canceledTx, PRO_ID, profile, proClaims, setTestEnv, settings, SUB_ID, subItem } from '../testing/fixtures';
import { DEFAULT_PRICE_SEEDS } from './prices';
import { loadSubscription } from './subscriptions';
import { actingProId, addTeamMember, approveTeamRequest, createTeamRequest, rejectTeamRequest } from './teams';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const NOW = new Date('2026-10-23T15:00:00.000Z');
const admin: AuthUser = { sub: 'admin-sub', email: 'admin@separame.app', groups: ['admin'], isAdmin: true };
const team = (overrides = {}) => ({
  ownerId: PRO_ID, name: 'Consultorio Sonríe', slug: 'consultorio-sonrie', seats: 2, memberIds: ['m1'], memberSlugs: ['dr-julian-ortiz'],
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), ...overrides,
});
const pending = { ownerId: PRO_ID, status: 'pending', name: 'Consultorio Sonríe', professionals: 3, message: '', createdAt: NOW.toISOString() };
const tx = () => ddb.commandCalls(TransactWriteCommand).at(-1)!.args[0].input.TransactItems!;

beforeEach(() => {
  ddb.reset();
  ses.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: ownerKey(SUB_ID) }).resolves({ Item: { proId: PRO_ID } });
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: profile });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
  ddb.on(GetCommand, { Key: settingsKey(PRO_ID) }).resolves({ Item: settings });
  ddb.on(GetCommand, { Key: priceKey('fundador-v1') }).resolves({ Item: { ...DEFAULT_PRICE_SEEDS[0], createdAt: NOW.toISOString() } });
  ddb.on(QueryCommand).resolves({ Items: [] });
  ddb.on(BatchGetCommand).resolves({ Responses: { 'separame-test': [profile] } });
  ddb.on(TransactWriteCommand).resolves({});
  ses.on(SendEmailCommand).resolves({});
});

describe('actingProId', () => {
  it('is the owner, or a member of their team named in the header', async () => {
    expect(await actingProId(apiEvent('GET /me/appointments', { claims: proClaims }))).toBe(PRO_ID);
    ddb.on(GetCommand, { Key: teamKey(PRO_ID) }).resolves({ Item: team() });
    const asMember = apiEvent('GET /me/appointments', { claims: proClaims, headers: { [ACTING_PRO_HEADER]: 'm1' } });
    expect(await actingProId(asMember)).toBe('m1');
    const stranger = apiEvent('GET /me/appointments', { claims: proClaims, headers: { [ACTING_PRO_HEADER]: 'someone-else' } });
    await expect(actingProId(stranger)).rejects.toMatchObject({ code: 'forbidden' });
  });
});

describe('loadSubscription', () => {
  it('a team member follows the owner subscription (one expiry for the team)', async () => {
    ddb.on(GetCommand, { Key: profileKey('m1') }).resolves({ Item: { ...profile, id: 'm1', ownerId: PRO_ID } });
    const { item } = await loadSubscription('m1', NOW);
    expect(item.proId).toBe(PRO_ID);
  });
});

describe('team request', () => {
  it('is stored pending (listed for the admin) and alerts the operator', async () => {
    await createTeamRequest(PRO_ID, { name: 'Consultorio Sonríe', professionals: 3, message: 'Somos tres' }, NOW);
    const put = tx()[0].Put!;
    expect(put.Item).toMatchObject({ ...teamRequestKey(PRO_ID), status: 'pending', professionals: 3, GSI1PK: 'TEAMREQS' });
    expect(put.ConditionExpression).toBe('attribute_not_exists(PK) OR #s <> :pending');
    const subjects = ses.commandCalls(SendEmailCommand).map((c) => c.args[0].input.Content!.Simple!.Subject!.Data);
    expect(subjects).toEqual(['Solicitud de plan para equipos · Consultorio Sonríe']);
  });

  it('only one at a time', async () => {
    ddb.on(GetCommand, { Key: teamRequestKey(PRO_ID) }).resolves({ Item: pending });
    await expect(createTeamRequest(PRO_ID, { name: 'Otro', professionals: 2, message: '' }, NOW)).rejects.toMatchObject({ code: 'conflict' });
  });

  it('approval creates the team with a free slug and its seats, and emails the owner', async () => {
    ddb.on(GetCommand, { Key: teamRequestKey(PRO_ID) }).resolves({ Item: pending });
    ddb.on(GetCommand, { Key: slugKey('consultorio-sonrie') }).resolves({ Item: { proId: 'someone' } });
    await approveTeamRequest(admin, PRO_ID, 2, NOW);
    const [review, created, slug] = tx();
    expect(review.Update!.UpdateExpression).toContain('REMOVE GSI1PK, GSI1SK');
    expect(review.Update!.ExpressionAttributeValues).toMatchObject({ ':status': 'approved', ':seats': 2 });
    expect(created.Put!.Item).toMatchObject({ ...teamKey(PRO_ID), slug: 'consultorio-sonrie-2', seats: 2, memberIds: [], GSI1PK: 'TEAMS' });
    expect(slug.Put!.Item).toMatchObject({ ...slugKey('consultorio-sonrie-2'), teamOwnerId: PRO_ID });
    const email = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(email.Content!.Simple!.Subject!.Data).toBe('Tu plan para equipos está listo');
    expect(email.Content!.Simple!.Body!.Text!.Data).toContain('$3.900 al mes');
  });

  it('cannot approve fewer seats than members already created', async () => {
    ddb.on(GetCommand, { Key: teamRequestKey(PRO_ID) }).resolves({ Item: pending });
    ddb.on(GetCommand, { Key: teamKey(PRO_ID) }).resolves({ Item: team({ memberIds: ['m1', 'm2'] }) });
    await expect(approveTeamRequest(admin, PRO_ID, 1, NOW)).rejects.toMatchObject({ code: 'validation' });
  });

  it('rejection keeps the reason and emails the owner', async () => {
    ddb.on(GetCommand, { Key: teamRequestKey(PRO_ID) }).resolves({ Item: pending });
    await rejectTeamRequest(admin, PRO_ID, 'Por ahora solo consultorios con agenda compartida', NOW);
    expect(tx()[0].Update!.ExpressionAttributeValues).toMatchObject({ ':status': 'rejected', ':reason': 'Por ahora solo consultorios con agenda compartida' });
    expect(ses.commandCalls(SendEmailCommand)[0].args[0].input.Content!.Simple!.Subject!.Data).toBe('Sobre tu solicitud de plan para equipos');
  });
});

describe('addTeamMember', () => {
  it('creates a professional without user or subscription, with the owner place and schedule, within the seats', async () => {
    ddb.on(GetCommand, { Key: teamKey(PRO_ID) }).resolves({ Item: team() });
    await addTeamMember(PRO_ID, { name: 'Dra. Sara Gómez', title: 'Endodoncista', slug: 'dra-sara-gomez' }, NOW);
    const [seat, slug, member, memberSettings] = tx();
    expect(seat.Update!.ConditionExpression).toBe('size(memberIds) < seats');
    const memberId = slug.Put!.Item!.proId as string;
    expect(member.Put!.Item).toMatchObject({
      ...profileKey(memberId), name: 'Dra. Sara Gómez', slug: 'dra-sara-gomez', ownerId: PRO_ID, city: profile.city, email: profile.email,
    });
    expect(memberSettings.Put!.Item).toMatchObject({ ...settingsKey(memberId), schedule: settings.schedule });
    expect(tx().some((t) => t.Put?.Item?.SK === 'SUB' || String(t.Put?.Item?.PK).startsWith('OWNER#'))).toBe(false);
  });

  it('no seats left → 409; a taken link → slug_taken', async () => {
    ddb.on(GetCommand, { Key: teamKey(PRO_ID) }).resolves({ Item: team({ seats: 1 }) });
    await expect(addTeamMember(PRO_ID, { name: 'Otra', title: 'X', slug: 'otra-pro' }, NOW)).rejects.toMatchObject({ code: 'conflict' });
    ddb.on(GetCommand, { Key: teamKey(PRO_ID) }).resolves({ Item: team() });
    ddb.on(TransactWriteCommand).rejects(canceledTx(['None', 'ConditionalCheckFailed', 'None', 'None']));
    await expect(addTeamMember(PRO_ID, { name: 'Otra', title: 'X', slug: 'tomado' }, NOW)).rejects.toMatchObject({ code: 'slug_taken' });
  });
});
