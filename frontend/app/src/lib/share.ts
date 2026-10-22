import type { AnalyticsEvents } from '@shared/analytics';
import { track } from './analytics';
import { copyText } from './clipboard';

export type ShareOutcome = 'shared' | 'cancelled' | 'copied' | 'failed';

/** True when the device has a native share sheet (phones, and some desktop browsers). */
export function canShareNatively(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/**
 * Opens the native share sheet with the link, or copies it when there is none (or it fails).
 * Closing the sheet without picking an app is 'cancelled', not an error.
 */
export async function shareOrCopy(data: { title: string; text?: string; url: string }): Promise<ShareOutcome> {
  if (canShareNatively()) {
    try {
      await navigator.share(data);
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    }
  }
  return (await copyText(data.url)) ? 'copied' : 'failed';
}

/** Copies a link and counts it (the booking link copied from the onboarding or the profile). */
export async function copyLink(url: string, contentType: AnalyticsEvents['share']['content_type']): Promise<boolean> {
  const copied = await copyText(url);
  if (copied) trackShare('copied', contentType);
  return copied;
}

/** Analytics for a share or copy that went through (cancelled / failed ones aren't counted). */
export function trackShare(outcome: ShareOutcome, contentType: AnalyticsEvents['share']['content_type']): void {
  if (outcome === 'shared') track('share', { method: 'native', content_type: contentType });
  else if (outcome === 'copied') track('share', { method: 'copy', content_type: contentType });
}
