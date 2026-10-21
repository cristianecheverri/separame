import { randomBytes } from 'node:crypto';

/**
 * Sortable, URL-safe ids without dependencies: 9 base-36 chars of epoch
 * milliseconds (sorts lexicographically until the year 5188) + 8 random
 * base-36 chars. Lowercase alphanumerics only, so ids can sit inside
 * `-`/`#`-separated keys and payment references without escaping.
 */

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

function randomChars(length: number): string {
  const bytes = randomBytes(length);
  let out = '';
  // 252 = 36 * 7: reject the top bytes to avoid modulo bias.
  for (let i = 0; i < length; i++) {
    let b = bytes[i];
    while (b >= 252) b = randomBytes(1)[0];
    out += ALPHABET[b % 36];
  }
  return out;
}

export function newId(now: Date = new Date()): string {
  return now.getTime().toString(36).padStart(9, '0') + randomChars(8);
}

export const ID_RE = /^[0-9a-z]{6,40}$/;
