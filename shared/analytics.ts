import { STAGE_DOMAINS } from './infra';
import { REFERRAL_QUERY_PARAM } from './referrals';

/**
 * Google Analytics 4 contract shared by both frontends; each one loads gtag
 * through its own `src/lib/analytics.ts`. Rules:
 *  - Only the prod site measures (dev, localhost and tests send nothing).
 *  - Never personal data: no names, emails, phones or free text in params, and
 *    every page_location goes through `sanitizeLocation` (the /c/ and /w/
 *    tokens are secrets; client keys are pseudonymous personal data).
 *  - The admin area is not measured.
 * The GA web stream must have "Outbound clicks", "File downloads" and "Page
 * changes based on browser history events" OFF in Enhanced measurement: those
 * would send raw URLs (wa.me/<client phone>, .ics links with the manage token).
 */

export const GA_MEASUREMENT_ID = 'G-48XHR8L6CY';

export const analyticsEnabledFor = (hostname: string): boolean => hostname === STAGE_DOMAINS.prod.site;

type ProSlug = { pro_slug: string };
type YesNo = 'yes' | 'no';

/** Every event the frontends may send, with its params (GA4 snake_case, low cardinality). */
export interface AnalyticsEvents {
  // Landing and legal pages
  cta_click: { location: 'hero' | 'teams' | 'final' };
  // Public booking page (the pro's clients)
  booking_view: ProSlug;
  booking_step: ProSlug & { step: 'service' | 'when' | 'details' | 'review' };
  booking_confirmed: ProSlug & { has_email: YesNo };
  booking_error: ProSlug & { reason: string };
  booking_unavailable: ProSlug;
  waitlist_joined: ProSlug;
  add_to_calendar: { method: 'device' | 'google' | 'outlook' | 'ics' };
  // Manage link (/c/<token>) and waitlist leave link (/w/<token>)
  appointment_cancelled: { by: 'client' | 'pro' };
  appointment_rescheduled: { by: 'client' | 'pro' };
  attendance_confirmed: Record<string, never>;
  waitlist_left: Record<string, never>;
  // Panel
  sign_up: { method: 'email'; referred: YesNo };
  login: { method: 'email' };
  /** Onboarding step that creates the profile and its public link. */
  agenda_created: { referred: YesNo };
  share: { method: 'native' | 'copy'; content_type: 'booking_link' | 'referral_link' };
  appointment_created: { by: 'pro' };
  payment_notice_sent: { months: number };
  push_enabled: Record<string, never>;
  app_installed: Record<string, never>;
}

export type AnalyticsEventName = keyof AnalyticsEvents;

/** Path segments that identify a secret or a person, replaced before anything leaves the browser. */
const MASKED_PATHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/^\/c\/[^/]+/, '/c/[token]'],
  [/^\/w\/[^/]+/, '/w/[token]'],
  [/^\/app\/clients\/[^/]+/, '/app/clients/[client]'],
];

const NOT_MEASURED = /^\/app\/admin(\/|$)/;

/** Query params worth keeping: campaign tags and the referral code (public, it is in /r/<code>). */
const KEPT_PARAMS = /^(utm_[a-z]+|gclid|fbclid)$/;

/** The URL GA may see, or null when the page must not be measured at all. */
export function sanitizeLocation(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, '') || '/';
  if (NOT_MEASURED.test(path)) return null;
  const maskedPath = MASKED_PATHS.reduce((current, [pattern, mask]) => current.replace(pattern, mask), path);
  const kept = new URLSearchParams();
  for (const [key, value] of url.searchParams) {
    if (KEPT_PARAMS.test(key) || key === REFERRAL_QUERY_PARAM) kept.append(key, value);
  }
  const query = kept.toString();
  return `${url.origin}${maskedPath}${query ? `?${query}` : ''}`;
}

/** Same-site referrers are sanitized like page locations; other sites keep only their origin. */
export function sanitizeReferrer(referrer: string, siteOrigin: string): string {
  if (!referrer) return '';
  try {
    const url = new URL(referrer);
    if (url.origin === siteOrigin) return sanitizeLocation(referrer) ?? siteOrigin;
    return `${url.origin}/`;
  } catch {
    return '';
  }
}
