/**
 * Zod-free contact validation shared by the booking bundle (which can't afford
 * zod) and `schemas.ts`, so the client and the server accept exactly the same
 * input and show the same Spanish messages.
 */

export const CONTACT_MESSAGES = {
  nameShort: 'Escribe tu nombre completo',
  nameLong: 'El nombre es muy largo',
  email: 'Revisa tu correo, parece que le falta algo',
  phone: 'El celular debe tener 10 dígitos',
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidEmail(value: string): boolean {
  const email = normalizeEmail(value);
  return email.length <= 254 && EMAIL_RE.test(email);
}

/** Colombian numbers: strips spaces, dashes, parentheses, dots and a leading +57 → 10 digits. */
export function normalizePhone(value: string): string {
  return value.replace(/[\s\-().]/g, '').replace(/^\+?57(?=\d{10}$)/, '');
}

export function isValidPhone(value: string): boolean {
  return /^\d{10}$/.test(normalizePhone(value));
}

export function nameProblem(value: string): string | null {
  const name = value.trim();
  if (name.length < 2) return CONTACT_MESSAGES.nameShort;
  if (name.length > 80) return CONTACT_MESSAGES.nameLong;
  return null;
}
