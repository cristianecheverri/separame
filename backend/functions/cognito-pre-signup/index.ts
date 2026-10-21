import type { PreSignUpTriggerEvent } from 'aws-lambda';
import { isDisposableEmail } from '../../lib/disposable-domains';

/**
 * Cognito pre sign-up: rejects disposable email domains (one free trial per
 * real email). Only self sign-up is checked; `PreSignUp_AdminCreateUser`
 * (the admin user CDK seeds) passes untouched. Cognito shows the thrown
 * message to the user (prefixed by "PreSignUp failed with error").
 */

export const DISPOSABLE_MESSAGE = 'Usa tu correo personal o de trabajo. No aceptamos correos temporales.';

export const handler = async (event: PreSignUpTriggerEvent): Promise<PreSignUpTriggerEvent> => {
  if (event.triggerSource !== 'PreSignUp_SignUp') return event;
  const email = (event.request.userAttributes?.email ?? '').trim().toLowerCase();
  if (email && isDisposableEmail(email)) throw new Error(DISPOSABLE_MESSAGE);
  return event;
};
