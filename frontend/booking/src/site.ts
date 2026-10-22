/**
 * Script of the static pages (landing, privacy, terms): analytics only. The
 * sign-up links carry `data-track="<location>"` so we know which one converts.
 */
import type { AnalyticsEvents } from '@shared/analytics';
import { initAnalytics, track, trackPageView } from './lib/analytics';

type CtaLocation = AnalyticsEvents['cta_click']['location'];
const CTA_LOCATIONS: readonly CtaLocation[] = ['hero', 'teams', 'final'];

const isCtaLocation = (value: string | undefined): value is CtaLocation =>
  CTA_LOCATIONS.includes(value as CtaLocation);

initAnalytics();
trackPageView();

document.addEventListener('click', (event) => {
  const link = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-track]') : null;
  const location = link?.dataset.track;
  if (isCtaLocation(location)) track('cta_click', { location });
});
