import type { CustomMessageTriggerEvent } from 'aws-lambda';
import { env } from '../../lib/env';
import { accountCodeEmail, adminInviteEmail, type AccountEmailKind } from '../../mail/templates/account-code';

/**
 * Cognito custom message (email + password accounts): branded line-A emails
 * for sign-up confirmation (+ resend), forgot password, attribute
 * verification and the admin invitation. Bodies keep Cognito's placeholders
 * (`event.request.codeParameter` = `{####}`, `usernameParameter`), which
 * Cognito substitutes afterwards. Unknown sources keep Cognito's default.
 * No env var is required (SITE_URL falls back to the production site).
 */

const CODE_KINDS: Partial<Record<CustomMessageTriggerEvent['triggerSource'], Exclude<AccountEmailKind, 'admin_invite'>>> = {
  CustomMessage_SignUp: 'confirm',
  CustomMessage_ResendCode: 'confirm',
  CustomMessage_ForgotPassword: 'forgot_password',
  CustomMessage_UpdateUserAttribute: 'verify_attribute',
  CustomMessage_VerifyUserAttribute: 'verify_attribute',
};

export const handler = async (event: CustomMessageTriggerEvent): Promise<CustomMessageTriggerEvent> => {
  const siteUrl = env.siteUrl();
  if (event.triggerSource === 'CustomMessage_AdminCreateUser') {
    const email = adminInviteEmail({
      siteUrl,
      username: event.request.usernameParameter ?? '{username}',
      tempPassword: event.request.codeParameter,
    });
    event.response.emailSubject = email.subject;
    event.response.emailMessage = email.html;
    return event;
  }
  const kind = CODE_KINDS[event.triggerSource];
  if (!kind) return event;
  const email = accountCodeEmail({ siteUrl, kind, code: event.request.codeParameter });
  event.response.emailSubject = email.subject;
  event.response.emailMessage = email.html;
  return event;
};
