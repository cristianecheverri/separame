/** Small copy helpers for the booking pages (names are used as written — no gender guessing). */
import type { PublicProfile } from '@shared/api';

export { normalizePhone } from '@shared/contact';

export const PRICE_NOTE = 'Precios de referencia. El valor final se confirma en la cita.';

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}

/** "El Poblado, Medellín", or just the city when there's no neighbourhood. */
export function placeLine(profile: Pick<PublicProfile, 'neighborhood' | 'city'>): string {
  return [profile.neighborhood?.trim(), profile.city].filter(Boolean).join(', ');
}

/** "Cra. 43A #1-50, consultorio 302, El Poblado[, Medellín]". */
export function fullAddress(place: Pick<PublicProfile, 'address' | 'neighborhood' | 'city'>, withCity: boolean): string {
  return [place.address, place.neighborhood, withCity ? place.city : ''].map((p) => p?.trim()).filter(Boolean).join(', ');
}

/** "300 123 4567" for 10-digit Colombian numbers; anything else is returned as is. */
export function formatPhone(digits: string): string {
  const d = digits.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}` : digits;
}

/** `tel:` href for a Colombian number. */
export function telHref(phone: string): string {
  return `tel:+57${phone.replace(/\D/g, '').replace(/^57(?=\d{10}$)/, '')}`;
}

/** "Valoración · 30 min" style joins that skip empty parts. */
export function joinDot(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' · ');
}
