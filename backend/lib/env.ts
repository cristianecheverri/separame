import { ENV, ssmPrefix, STAGE_DOMAINS } from '../../shared/infra';
import type { Stage } from '../../shared/types';

/**
 * Typed access to the environment variables the CDK app sets on every Lambda
 * (names live in `shared/infra.ts`). Read lazily — tests set `process.env`
 * after import — and fail loudly when a required value is missing, so a
 * misconfigured function errors on its first call instead of writing garbage.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

const optional = (name: string): string | undefined => process.env[name] || undefined;

/** For URL fallbacks only: an absent STAGE means prod links (never send people to dev by accident). */
const fallbackStage = (): Stage => (process.env[ENV.stage] === 'dev' ? 'dev' : 'prod');

export const env = {
  stage: (): Stage => (process.env[ENV.stage] === 'prod' ? 'prod' : 'dev'),
  isProd: (): boolean => process.env[ENV.stage] === 'prod',
  tableName: (): string => required(ENV.tableName),
  /** https://separame.app — no trailing slash. Falls back to the stage's domain (Cognito triggers get no URL vars). */
  siteUrl: (): string => (optional(ENV.siteUrl) ?? `https://${STAGE_DOMAINS[fallbackStage()].site}`).replace(/\/$/, ''),
  apiUrl: (): string => (optional(ENV.apiUrl) ?? `https://${STAGE_DOMAINS[fallbackStage()].api}`).replace(/\/$/, ''),
  siteBucket: (): string => required(ENV.siteBucket),
  siteDistributionId: (): string | undefined => optional(ENV.siteDistributionId),
  mailFrom: (): string => required(ENV.mailFrom),
  mailConfigSet: (): string | undefined => optional(ENV.mailConfigSet),
  userPoolId: (): string | undefined => optional(ENV.userPoolId),
  /** `/separame/<stage>` — derived from the stage when not set explicitly. */
  ssmPrefix: (): string => (optional(ENV.ssmPrefix) ?? ssmPrefix(env.stage())).replace(/\/$/, ''),
  turnstileSiteKey: (): string | undefined => optional(ENV.turnstileSiteKey),
  /** Operator inbox for "Ya pagué" notices; unset → no alert email. */
  adminEmail: (): string | undefined => optional(ENV.adminEmail),
};
