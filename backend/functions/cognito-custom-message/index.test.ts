import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { beforeEach, describe, expect, it } from 'vitest';
import { handler } from './index';

function event(triggerSource: string, extra: Record<string, unknown> = {}): CustomMessageTriggerEvent {
  return {
    version: '1', region: 'us-east-1', userPoolId: 'us-east-1_x', userName: 'u', callerContext: { awsSdkVersion: '', clientId: '' },
    triggerSource,
    request: { userAttributes: { email: 'laura@correo.com' }, codeParameter: '{####}', usernameParameter: null, linkParameter: '', ...extra },
    response: { smsMessage: null, emailMessage: null, emailSubject: null },
  } as unknown as CustomMessageTriggerEvent;
}

beforeEach(() => {
  // Triggers get no URL env vars: the site URL must fall back.
  delete process.env.SITE_URL;
  delete process.env.STAGE;
});

describe('cognito-custom-message', () => {
  it.each([
    ['CustomMessage_SignUp', 'Confirma tu correo en Sepárame'],
    ['CustomMessage_ResendCode', 'Confirma tu correo en Sepárame'],
    ['CustomMessage_ForgotPassword', 'Crea una nueva contraseña'],
    ['CustomMessage_UpdateUserAttribute', 'Confirma tu nuevo correo en Sepárame'],
    ['CustomMessage_VerifyUserAttribute', 'Confirma tu nuevo correo en Sepárame'],
  ])('%s → branded email with the code placeholder', async (source, subject) => {
    const res = await handler(event(source));
    expect(res.response.emailSubject).toBe(subject);
    expect(res.response.emailMessage).toContain('{####}');
    expect(res.response.emailMessage).toContain('sepárame');
  });

  it('admin invitation shows username + temporary password placeholders and the login link', async () => {
    const res = await handler(event('CustomMessage_AdminCreateUser', { usernameParameter: '{username}' }));
    expect(res.response.emailSubject).toBe('Te invitamos a administrar Sepárame');
    expect(res.response.emailMessage).toContain('{username}');
    expect(res.response.emailMessage).toContain('{####}');
    expect(res.response.emailMessage).toContain('https://separame.app/app/login');
  });

  it('leaves other sources untouched', async () => {
    const res = await handler(event('CustomMessage_Authentication'));
    expect(res.response.emailMessage).toBeNull();
  });
});
