/**
 * Contact form validation on top of shared/contact.ts (the same zod-free rules
 * and messages the API uses), plus the booking-only consent check.
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

export const CONSENT_MESSAGE = 'Debes autorizar el tratamiento de tus datos';

export function validateField(field: ContactField, form: ContactForm): string | undefined {
  switch (field) {
    case 'name':
      return nameProblem(form.name) ?? undefined;
    case 'email':
      return isValidEmail(form.email) ? undefined : CONTACT_MESSAGES.email;
    case 'phone':
      return isValidPhone(form.phone) ? undefined : CONTACT_MESSAGES.phone;
    case 'agree':
      return form.agree ? undefined : CONSENT_MESSAGE;
  }
}

export const CONTACT_FIELDS: ContactField[] = ['name', 'email', 'phone', 'agree'];

export function validateContact(form: ContactForm): ContactErrors {
  const errors: ContactErrors = {};
  for (const field of CONTACT_FIELDS) {
    const message = validateField(field, form);
    if (message) errors[field] = message;
  }
  return errors;
}

/** Every field has something in it (the "Siguiente" button unlocks; validation runs on click). */
export function isContactFilled(form: ContactForm): boolean {
  return Boolean(form.name.trim() && form.email.trim() && form.phone.trim() && form.agree);
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
