import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { SNSEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTestEnv } from '../../testing/fixtures';
import { addressesToSuppress, handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
const sns = (message: unknown) => ({ Records: [{ Sns: { Message: JSON.stringify(message) } }] }) as unknown as SNSEvent;

beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
});

describe('ses-feedback', () => {
  it('suppresses permanent bounces and complaints, ignores transient bounces', () => {
    expect(addressesToSuppress({ eventType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'a@b.co' }] } }).addresses).toEqual(['a@b.co']);
    expect(addressesToSuppress({ eventType: 'Bounce', bounce: { bounceType: 'Transient', bouncedRecipients: [{ emailAddress: 'a@b.co' }] } }).addresses).toEqual([]);
    expect(addressesToSuppress({ notificationType: 'Complaint', complaint: { complainedRecipients: [{ emailAddress: 'c@d.co' }] } }).reason).toBe('complaint');
  });

  it('writes SUPPRESS#<email> items (lowercased, bare address)', async () => {
    await handler(sns({ eventType: 'Bounce', bounce: { bounceType: 'Permanent', bouncedRecipients: [{ emailAddress: 'Mariana <Mariana@Correo.com>' }] } }));
    const item = ddb.commandCalls(PutCommand)[0].args[0].input.Item!;
    expect(item).toMatchObject({ PK: 'SUPPRESS#mariana@correo.com', SK: 'SUPPRESS', reason: 'bounce' });
    expect(item.ttl).toBeUndefined();
  });
});
