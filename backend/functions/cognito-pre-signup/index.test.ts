import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { setTestEnv } from '../../testing/fixtures';
import { isDisposableEmail } from '../../lib/disposable-domains';
import { DISPOSABLE_MESSAGE, handler } from './index';

setTestEnv();
const ddb = mockClient(DynamoDBDocumentClient);
beforeEach(() => {
  ddb.reset();
  ddb.on(PutCommand).resolves({});
});

const event = (email: string, triggerSource = 'PreSignUp_SignUp', clientMetadata?: Record<string, string>) => ({
  triggerSource, request: { userAttributes: { email }, clientMetadata }, response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
}) as unknown as PreSignUpTriggerEvent;

describe('cognito-pre-signup', () => {
  it('rejects disposable domains (case-insensitive, subdomains too)', async () => {
    await expect(handler(event('Someone@MAILINATOR.com'))).rejects.toThrow(DISPOSABLE_MESSAGE);
    expect(isDisposableEmail('x@inbox.yopmail.com')).toBe(true);
  });

  it('lets real addresses through', async () => {
    const e = event('laura@gmail.com');
    await expect(handler(e)).resolves.toBe(e);
  });

  it('remembers the referral code sent as clientMetadata (and never blocks on failure)', async () => {
    await handler(event('nuevo@correo.com', 'PreSignUp_SignUp', { referralCode: 'laura-perez' }));
    expect(ddb.commandCalls(PutCommand)[0].args[0].input.Item).toMatchObject({ SK: 'REFSIGNUP', code: 'laura-perez' });
    ddb.on(PutCommand).rejects(new Error('boom'));
    const e = event('otro@correo.com', 'PreSignUp_SignUp', { referralCode: 'laura-perez' });
    await expect(handler(e)).resolves.toBe(e);
    await handler(event('sin-codigo@correo.com'));
    expect(ddb.commandCalls(PutCommand)).toHaveLength(2);
  });

  it('never blocks admin-created users', async () => {
    const e = event('admin@mailinator.com', 'PreSignUp_AdminCreateUser');
    await expect(handler(e)).resolves.toBe(e);
  });
});
