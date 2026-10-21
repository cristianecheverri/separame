/**
 * Contact form validation on top of shared/contact.ts (the same zod-free rules
 * and messages the API uses), plus the consent check. The public booking takes
 * an optional email (the phone is what the pro needs); the waitlist requires it
 * (offers only reach the client by email).
 */
import { CONTACT_MESSAGES, isValidEmail, isValidPhone, nameProblem } from '@shared/contact';

export interface ContactForm {
  name: string;
  email: string;
  phone: string;
  agree: boolean;
}

export type ContactField = keyof ContactForm;
export type ContactErrors = Partial<Record<ContactField, string>>;

export interface ContactRules {
  /** Booking: '' is fine, a typed email must be valid. */
  emailOptional?: boolean;
}

export const CONSENT_MESSAGE = 'Debes autorizar el tratamiento de tus datos';

export function validateField(field: ContactField, form: ContactForm, rules: ContactRules = {}): string | undefined {
  switch (field) {
    case 'name':
      return nameProblem(form.name) ?? undefined;
    case 'email':
      if (rules.emailOptional && !form.email.trim()) return undefined;
      return isValidEmail(form.email) ? undefined : CONTACT_MESSAGES.email;
    case 'phone':
      return isValidPhone(form.phone) ? undefined : CONTACT_MESSAGES.phone;
    case 'agree':
      return form.agree ? undefined : CONSENT_MESSAGE;
  }
}

/** Form order (the first invalid one gets the focus): Nombre, Celular, Correo, consent. */
export const CONTACT_FIELDS: ContactField[] = ['name', 'phone', 'email', 'agree'];

export function validateContact(form: ContactForm, rules: ContactRules = {}): ContactErrors {
  const errors: ContactErrors = {};
  for (const field of CONTACT_FIELDS) {
    const message = validateField(field, form, rules);
    if (message) errors[field] = message;
  }
  return errors;
}

/** Every text field the form needs has something typed in it (validation runs on click). */
function fieldsTyped(form: ContactForm, rules: ContactRules): boolean {
  return Boolean(form.name.trim() && (rules.emailOptional || form.email.trim()) && form.phone.trim());
}

/** Everything is filled and the consent is checked (the "Siguiente" button unlocks). */
export function isContactFilled(form: ContactForm, rules: ContactRules = {}): boolean {
  return fieldsTyped(form, rules) && form.agree;
}

/** Label of the locked button: says what is missing, in form order (the consent is easy to overlook). */
export function contactBlockedLabel(form: ContactForm, rules: ContactRules = {}): string {
  if (!form.name.trim()) return 'Escribe tu nombre para seguir';
  if (!form.phone.trim()) return 'Escribe tu celular para seguir';
  if (!rules.emailOptional && !form.email.trim()) return 'Escribe tu correo para seguir';
  return 'Acepta la autorización para seguir';
}

/** Maps API `fields` keys ("client.email", "consent"…) onto form fields. */
export function fieldsFromApi(fields: Record<string, string> | undefined): ContactErrors {
  const errors: ContactErrors = {};
  for (const [key, message] of Object.entries(fields ?? {})) {
    const leaf = key.split('.').pop();
    if (leaf === 'name' || leaf === 'email' || leaf === 'phone') errors[leaf] = message;
    if (leaf === 'consent') errors.agree = message;
  }
  return errors;
}
