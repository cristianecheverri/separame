import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { profileKey, subKey } from '../lib/keys';
import { conditionalFailure, PRO_ID, profile, setTestEnv, subItem } from '../testing/fixtures';
import { sendFeedback } from './feedback';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const ses = mockClient(SESv2Client);
const NOW = new Date('2026-10-29T15:00:00.000Z');

beforeEach(() => {
  ddb.reset();
  ses.reset();
  ddb.on(GetCommand).resolves({});
  ddb.on(GetCommand, { Key: profileKey(PRO_ID) }).resolves({ Item: { ...profileKey(PRO_ID), ...profile } });
  ddb.on(GetCommand, { Key: subKey(PRO_ID) }).resolves({ Item: subItem() });
  ddb.on(UpdateCommand).resolves({});
  ddb.on(PutCommand).resolves({});
  ses.on(SendEmailCommand).resolves({ MessageId: 'm1' });
});

describe('sendFeedback («Ayúdanos a mejorar»)', () => {
  it('keeps the message and emails the operator, replying goes to the professional', async () => {
    await sendFeedback(PRO_ID, { kind: 'idea', message: 'Que se pueda reservar en pareja.\nGracias', page: '/agenda' }, NOW);
    expect(ddb.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ PK: `PRO#${PRO_ID}`, SK: 'FEEDBACK#2026-10-29T15:00:00.000Z', kind: 'idea', page: '/agenda' });
    const mail = ses.commandCalls(SendEmailCommand)[0].args[0].input;
    expect(mail.Destination?.ToAddresses).toEqual(['ops@separame.app']);
    expect(mail.ReplyToAddresses).toEqual([profile.email]);
    expect(mail.Content?.Simple?.Subject?.Data).toBe(`Una idea · ${profile.name}`);
    expect(mail.Content?.Simple?.Body?.Text?.Data).toContain('Que se pueda reservar en pareja.');
  });

  it('is rate-limited per professional (10 a day)', async () => {
    ddb.on(UpdateCommand).rejects(conditionalFailure());
    await expect(sendFeedback(PRO_ID, { kind: 'problem', message: 'No carga la agenda' }, NOW)).rejects.toMatchObject({ code: 'rate_limited' });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });

  it('a mail failure never loses the message (it was stored first)', async () => {
    ses.on(SendEmailCommand).rejects(new Error('ses down'));
    await expect(sendFeedback(PRO_ID, { kind: 'question', message: '¿Cómo cambio mi enlace?' }, NOW)).resolves.toBeUndefined();
    expect(ddb.commandCalls(PutCommand)).toHaveLength(1);
  });
});
