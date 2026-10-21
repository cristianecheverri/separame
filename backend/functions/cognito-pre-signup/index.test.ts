import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { describe, expect, it } from 'vitest';
import { isDisposableEmail } from '../../lib/disposable-domains';
import { DISPOSABLE_MESSAGE, handler } from './index';

const event = (email: string, triggerSource = 'PreSignUp_SignUp') => ({
  triggerSource, request: { userAttributes: { email } }, response: { autoConfirmUser: false, autoVerifyEmail: false, autoVerifyPhone: false },
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

  it('never blocks admin-created users', async () => {
    const e = event('admin@mailinator.com', 'PreSignUp_AdminCreateUser');
    await expect(handler(e)).resolves.toBe(e);
  });
});
