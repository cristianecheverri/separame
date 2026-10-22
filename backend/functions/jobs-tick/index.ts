import { log } from '../../lib/logger';
import { sendDueReminders, sendRenewalNotices } from '../../services/jobs';
import { publishLanding } from '../../services/landing';
import { processMigrations } from '../../services/migrations';
import { publishSitemap } from '../../services/sitemap';

/**
 * The single recurring job (EventBridge Scheduler, every 10 minutes):
 * 24 h reminders, renewal notices, price migrations, the landing's prices and the sitemap. Each step is bounded
 * and isolated — one failing step doesn't block the others; leftovers run on
 * the next tick.
 */

const BUDGET = { reminders: 300, renewals: 100, migrations: 200 };

async function step<T>(name: string, run: () => Promise<T>): Promise<T | undefined> {
  try {
    const result = await run();
    log.info('job step done', { step: name, result });
    return result;
  } catch (err) {
    log.error('job step failed', { step: name, err });
    return undefined;
  }
}

export const handler = async (): Promise<void> => {
  const now = new Date();
  await step('reminders', () => sendDueReminders(now, BUDGET.reminders));
  await step('renewals', () => sendRenewalNotices(now, BUDGET.renewals));
  await step('migrations', () => processMigrations(now, BUDGET.migrations));
  // Two HEAD requests when nothing changed; re-renders / after a deploy or a price change.
  await step('landing', () => publishLanding({ now }));
  await step('sitemap', () => publishSitemap(now));
};
