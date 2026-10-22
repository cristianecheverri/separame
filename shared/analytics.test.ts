import { describe, expect, it } from 'vitest';
import { analyticsEnabledFor, sanitizeLocation, sanitizeReferrer } from './analytics';

const SITE = 'https://separame.app';

describe('analyticsEnabledFor', () => {
  it('measures only the prod site', () => {
    expect(analyticsEnabledFor('separame.app')).toBe(true);
    expect(analyticsEnabledFor('dev.separame.app')).toBe(false);
    expect(analyticsEnabledFor('www.separame.app')).toBe(false); // redirects to the apex first
    expect(analyticsEnabledFor('localhost')).toBe(false);
  });
});

describe('sanitizeLocation', () => {
  it('masks the secret tokens of the manage and waitlist links', () => {
    expect(sanitizeLocation(`${SITE}/c/eyJhbGciOi.abc.def`)).toBe(`${SITE}/c/[token]`);
    expect(sanitizeLocation(`${SITE}/c/eyJhbGciOi.abc.def?action=confirm`)).toBe(`${SITE}/c/[token]`);
    expect(sanitizeLocation(`${SITE}/w/tok-123/`)).toBe(`${SITE}/w/[token]`);
  });

  it('masks client keys in the panel and skips the admin area', () => {
    expect(sanitizeLocation(`${SITE}/app/clients/3fa9c0d1e2`)).toBe(`${SITE}/app/clients/[client]`);
    expect(sanitizeLocation(`${SITE}/app/clients`)).toBe(`${SITE}/app/clients`);
    expect(sanitizeLocation(`${SITE}/app/admin`)).toBeNull();
    expect(sanitizeLocation(`${SITE}/app/admin/pros/p1`)).toBeNull();
    expect(sanitizeLocation(`${SITE}/app/administrator`)).toBe(`${SITE}/app/administrator`);
  });

  it('keeps public pages and only campaign / referral query params', () => {
    expect(sanitizeLocation(`${SITE}/`)).toBe(`${SITE}/`);
    expect(sanitizeLocation(`${SITE}/dra-laura/`)).toBe(`${SITE}/dra-laura`);
    expect(sanitizeLocation(`${SITE}/app/signup?ref=ana-7&email=x%40y.co&utm_source=ig`)).toBe(
      `${SITE}/app/signup?ref=ana-7&utm_source=ig`,
    );
    expect(sanitizeLocation(`${SITE}/?gclid=abc&fecha=2026-10-22`)).toBe(`${SITE}/?gclid=abc`);
  });

  it('rejects what is not a URL', () => {
    expect(sanitizeLocation('not a url')).toBeNull();
  });
});

describe('sanitizeReferrer', () => {
  it('sanitizes same-site referrers and keeps only the origin of other sites', () => {
    expect(sanitizeReferrer(`${SITE}/c/secret-token`, SITE)).toBe(`${SITE}/c/[token]`);
    expect(sanitizeReferrer(`${SITE}/app/admin/overview`, SITE)).toBe(SITE);
    expect(sanitizeReferrer('https://l.instagram.com/?u=https%3A%2F%2Fseparame.app%2Fana&e=AT0', SITE)).toBe('https://l.instagram.com/');
    expect(sanitizeReferrer('', SITE)).toBe('');
  });
});
