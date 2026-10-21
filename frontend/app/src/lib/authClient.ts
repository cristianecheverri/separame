/**
 * What the panel needs from Cognito (email + password, SRP). Implemented with
 * Amplify Auth in production (`amplifyAuth.ts`) and faked in mock mode.
 */

/** Where a sign-in attempt stands. */
export type SignInStep = 'done' | 'confirmSignUp' | 'newPassword' | 'resetPassword';

export interface AuthClient {
  /** Current ID token (refreshed by the SDK when needed); null when signed out. */
  getIdToken(forceRefresh?: boolean): Promise<string | null>;
  signIn(email: string, password: string): Promise<SignInStep>;
  /** First sign-in of an invited user (temporary password). */
  completeNewPassword(password: string): Promise<SignInStep>;
  /** Returns 'confirm' when Cognito emailed a code. */
  signUp(email: string, password: string): Promise<'confirm' | 'done'>;
  /** Returns true when the user can be signed in automatically (`autoSignIn`). */
  confirmSignUp(email: string, code: string): Promise<boolean>;
  autoSignIn(): Promise<SignInStep>;
  resendSignUpCode(email: string): Promise<void>;
  resetPassword(email: string): Promise<void>;
  confirmResetPassword(email: string, code: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

/** Same rules as the user pool's password policy. */
export const PASSWORD_RULES = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (p: string) => p.length >= 8 },
  { id: 'lower', label: 'Una minúscula', test: (p: string) => /[a-z]/.test(p) },
  { id: 'number', label: 'Un número', test: (p: string) => /\d/.test(p) },
] as const;

export const passwordOk = (p: string) => PASSWORD_RULES.every((r) => r.test(p));

function errorName(error: unknown): string {
  if (error && typeof error === 'object' && 'name' in error) return String((error as { name: unknown }).name);
  return 'Unknown';
}

/** Spanish (Colombia) copy for Cognito / Amplify failures. */
export function authErrorMessage(error: unknown): string {
  const name = errorName(error);
  const message = error instanceof Error ? error.message : '';
  switch (name) {
    case 'NotAuthorizedException':
      if (/attempts exceeded/i.test(message)) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
      return 'Correo o contraseña incorrectos.';
    case 'UserNotFoundException':
      return 'Correo o contraseña incorrectos.';
    case 'UserNotConfirmedException':
      return 'Aún no confirmas tu correo. Te enviamos un código para hacerlo.';
    case 'UsernameExistsException':
      return 'Ya hay una cuenta con ese correo. Entra con tu contraseña o recupérala.';
    case 'CodeMismatchException':
      return 'El código no coincide. Revísalo e inténtalo otra vez.';
    case 'ExpiredCodeException':
      return 'El código venció. Pide uno nuevo.';
    case 'LimitExceededException':
    case 'TooManyRequestsException':
    case 'TooManyFailedAttemptsException':
      return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
    case 'InvalidPasswordException':
      return 'La contraseña no cumple las reglas: mínimo 8 caracteres, una minúscula y un número.';
    case 'UserLambdaValidationException':
    case 'PreSignUpException':
      return 'No aceptamos correos temporales o desechables. Usa tu correo personal o de trabajo.';
    case 'InvalidParameterException':
      return 'Revisa los datos: el correo o la contraseña no son válidos.';
    case 'CodeDeliveryFailureException':
      return 'No pudimos enviarte el código. Inténtalo de nuevo en un momento.';
    case 'NetworkError':
      return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    default:
      if (/network/i.test(message)) return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
      return 'Algo salió mal. Inténtalo de nuevo.';
  }
}
