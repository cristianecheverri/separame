/** Web storage that never throws (private mode, blocked storage, quota): the booking draft in sessionStorage, the saved contact in localStorage. */
export function loadJson<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveJson(key: string, value: unknown): void {
  try {
    window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the flow still works, it just won't survive a reload */
  }
}

export function removeKey(key: string): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/**
 * "Recordar mis datos en este celular": name / phone / email kept in
 * localStorage (never the consent, which is asked on every booking).
 */
export interface SavedContact {
  name: string;
  phone: string;
  email: string;
}

const SAVED_CONTACT_KEY = 'separame:contact';

export function loadSavedContact(): SavedContact | null {
  try {
    const raw = window.localStorage.getItem(SAVED_CONTACT_KEY);
    const value = raw ? (JSON.parse(raw) as Partial<SavedContact>) : null;
    if (!value || typeof value.name !== 'string' || typeof value.phone !== 'string') return null;
    return { name: value.name, phone: value.phone, email: typeof value.email === 'string' ? value.email : '' };
  } catch {
    return null;
  }
}

export function saveContact(contact: SavedContact | null): void {
  try {
    if (contact) window.localStorage.setItem(SAVED_CONTACT_KEY, JSON.stringify(contact));
    else window.localStorage.removeItem(SAVED_CONTACT_KEY);
  } catch {
    /* storage unavailable: the client just types the data again next time */
  }
}
