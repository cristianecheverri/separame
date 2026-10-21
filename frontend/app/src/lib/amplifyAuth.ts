/** AuthClient backed by Amplify Auth v6 (Cognito user pool, SRP, no identity pool). */
import { Amplify } from 'aws-amplify';
import {
  autoSignIn, confirmResetPassword, confirmSignIn, confirmSignUp, fetchAuthSession, resendSignUpCode, resetPassword,
  signIn, signOut, signUp, type SignInOutput,
} from 'aws-amplify/auth';
import type { AuthClient, SignInStep } from './authClient';
import type { AppConfig } from './config';

function stepOf(out: SignInOutput): SignInStep {
  if (out.isSignedIn) return 'done';
  switch (out.nextStep.signInStep) {
    case 'CONFIRM_SIGN_UP':
      return 'confirmSignUp';
    case 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED':
      return 'newPassword';
    case 'RESET_PASSWORD':
      return 'resetPassword';
    case 'DONE':
      return 'done';
    default:
      // MFA and custom challenges are not enabled on this pool.
      throw Object.assign(new Error(`Unsupported step ${out.nextStep.signInStep}`), { name: 'UnsupportedStep' });
  }
}

export function createAmplifyAuth(config: AppConfig): AuthClient {
  Amplify.configure({
    Auth: { Cognito: { userPoolId: config.userPoolId, userPoolClientId: config.userPoolClientId, loginWith: { email: true } } },
  });

  return {
    async getIdToken(forceRefresh = false) {
      try {
        const session = await fetchAuthSession({ forceRefresh });
        return session.tokens?.idToken?.toString() ?? null;
      } catch {
        return null;
      }
    },
    async signIn(email, password) {
      try {
        return stepOf(await signIn({ username: email, password }));
      } catch (error) {
        if ((error as { name?: string }).name !== 'UserAlreadyAuthenticatedException') throw error;
        await signOut();
        return stepOf(await signIn({ username: email, password }));
      }
    },
    async completeNewPassword(password) {
      return stepOf(await confirmSignIn({ challengeResponse: password }));
    },
    async signUp(email, password, extra) {
      const clientMetadata = extra?.referralCode ? { referralCode: extra.referralCode } : undefined;
      const out = await signUp({ username: email, password, options: { userAttributes: { email }, autoSignIn: true, clientMetadata } });
      return out.nextStep.signUpStep === 'CONFIRM_SIGN_UP' ? 'confirm' : 'done';
    },
    async confirmSignUp(email, code) {
      const out = await confirmSignUp({ username: email, confirmationCode: code });
      return out.nextStep.signUpStep === 'COMPLETE_AUTO_SIGN_IN';
    },
    async autoSignIn() {
      return stepOf(await autoSignIn());
    },
    async resendSignUpCode(email) {
      await resendSignUpCode({ username: email });
    },
    async resetPassword(email) {
      await resetPassword({ username: email });
    },
    async confirmResetPassword(email, code, password) {
      await confirmResetPassword({ username: email, confirmationCode: code, newPassword: password });
    },
    async signOut() {
      await signOut();
    },
  };
}
