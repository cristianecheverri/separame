import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { isDisposableEmail } from '../../lib/disposable-domains';
import { log } from '../../lib/logger';
import { rememberSignupCode } from '../../services/referrals';

/**
 * Cognito pre sign-up: rejects disposable email domains (one free trial per
 * real email). Only self sign-up is checked; `PreSignUp_AdminCreateUser`
 * (the admin user CDK seeds) passes untouched. Cognito shows the thrown
 * message to the user (prefixed by "PreSignUp failed with error").
 *
 * It also remembers the referral code the signup page sends as clientMetadata
 * (`referralCode`), keyed by the email hash, so onboarding can attribute the
 * account even when the email is confirmed on another device. Best effort:
 * a failure here never blocks the sign-up.
 */

/** clientMetadata key the signup page uses for the /r/<code> referral code. */
export const REFERRAL_METADATA_KEY = 'referralCode';

export const DISPOSABLE_MESSAGE = 'Usa tu correo personal o de trabajo. No aceptamos correos temporales.';

export const handler = async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;
  const email = (event.request.userAttributes?.email ?? '').trim().toLowerCase();
  if (email && isDisposableEmail(email)) throw new Error(DISPOSABLE_MESSAGE);
  const code = event.request.clientMetadata?.[REFERRAL_METADATA_KEY];
  if (email && code) {
    await rememberSignupCode(email, code).catch((err) => log.warn('referral code not remembered at sign-up', { err }));
  }
  return event;
};
