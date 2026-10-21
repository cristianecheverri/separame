import { describe, expect, it } from 'vitest';
import { isValidPhone, normalizePhone, stripCountryCode } from './contact';

describe('normalizePhone', () => {
  it('keeps 10-digit national numbers and strips separators', () => {
    expect(normalizePhone('300 123 4567')).toBe('3001234567');
    expect(normalizePhone('(300) 123-4567')).toBe('3001234567');
    expect(normalizePhone('604.444.1234')).toBe('6044441234');
  });

  it('drops the Colombian country code in every common format', () => {
    expect(normalizePhone('+57 300 123 4567')).toBe('3001234567');
    expect(normalizePhone('(+57) 300 123 4567')).toBe('3001234567');
    expect(normalizePhone('57 300 123 4567')).toBe('3001234567');
    expect(normalizePhone('0057 300 123 4567')).toBe('3001234567');
    expect(normalizePhone('0057-300-123-4567')).toBe('3001234567');
  });

  it('leaves anything else alone so validation can reject it', () => {
    expect(normalizePhone('+1 300 123 4567')).toBe('+13001234567');
    expect(normalizePhone('5730012345')).toBe('5730012345');
    expect(isValidPhone('0057 300 123 4567')).toBe(true);
    expect(isValidPhone('+57 300 123')).toBe(false);
  });
});

describe('stripCountryCode', () => {
  it('removes an explicit +57 / 0057 prefix as soon as it is typed or pasted', () => {
    expect(stripCountryCode('+57 300 123 4567')).toBe('300 123 4567');
    expect(stripCountryCode('(+57) 300 123 4567')).toBe('300 123 4567');
    expect(stripCountryCode('0057 300 123 4567')).toBe('300 123 4567');
    expect(stripCountryCode('+573001234567')).toBe('3001234567');
    expect(stripCountryCode('+57')).toBe('');
  });

  it('removes a bare 57 only when a full national number follows', () => {
    expect(stripCountryCode('57 300 123 4567')).toBe('300 123 4567');
    expect(stripCountryCode('573001234567')).toBe('3001234567');
    expect(stripCountryCode('57')).toBe('57');
    expect(stripCountryCode('5730')).toBe('5730');
  });

  it('does not touch national numbers', () => {
    expect(stripCountryCode('300 123 4567')).toBe('300 123 4567');
    expect(stripCountryCode('604 444 1234')).toBe('604 444 1234');
    expect(stripCountryCode('')).toBe('');
  });
});
