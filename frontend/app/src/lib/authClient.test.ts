import { describe, expect, it } from 'vitest';
import { authErrorMessage, passwordOk } from './authClient';

const err = (name: string, message = '') => Object.assign(new Error(message), { name });

describe('auth errors in Spanish', () => {
  it.each([
    ['NotAuthorizedException', 'Correo o contraseña incorrectos.'],
    ['UsernameExistsException', 'Ya hay una cuenta con ese correo. Entra con tu contraseña o recupérala.'],
    ['CodeMismatchException', 'El código no coincide. Revísalo e inténtalo otra vez.'],
    ['ExpiredCodeException', 'El código venció. Pide uno nuevo.'],
    ['LimitExceededException', 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'],
    ['UserLambdaValidationException', 'No aceptamos correos temporales o desechables. Usa tu correo personal o de trabajo.'],
  ])('%s', (name, message) => {
    expect(authErrorMessage(err(name))).toBe(message);
  });

  it('detects lockouts behind NotAuthorizedException', () => {
    expect(authErrorMessage(err('NotAuthorizedException', 'Password attempts exceeded'))).toMatch(/Demasiados intentos/);
  });

  it('checks the password policy', () => {
    expect(passwordOk('separame1')).toBe(true);
    expect(passwordOk('SEPARAME1')).toBe(false);
    expect(passwordOk('corta1')).toBe(false);
  });
});
