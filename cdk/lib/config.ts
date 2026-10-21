import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { REGION, STAGE_DOMAINS, TURNSTILE_PROD_SITE_KEY, TURNSTILE_TEST_KEYS, ssmPrefix } from '../../shared/infra';

/**
 * Per-stage configuration. dev and prod share the exact same structure (same
 * stacks, same resources); only the values below change. Everything derives
 * from `STAGE_DOMAINS` in shared/infra.ts so the backend and the CDK app can't
 * drift apart.
 */
export type Stage = keyof typeof STAGE_DOMAINS;

export const STAGES: readonly Stage[] = ['dev', 'prod'];

/** Operator inbox: alarms, budget notifications and the seeded admin user. */
const OPERATOR_EMAIL = 'crisechevrri@gmail.com';

/** Vite dev servers (frontend/booking and frontend/app) — dev stage CORS only. */
const DEV_LOCAL_ORIGINS = ['http://localhost:5173', 'http://localhost:5174'];

export interface StageConfig {
  stage: Stage;
  /** `separame-<stage>` — prefix of every physical resource name. */
  prefix: string;
  region: string;
  siteDomain: string;
  /** Extra hostnames served by the site distribution (prod: www → 301 to apex). */
  siteAliases: string[];
  apiDomain: string;
  mailDomain: string;
  siteUrl: string;
  apiUrl: string;
  /** Bare sender address, e.g. `noreply@separame.app`. */
  mailFromAddress: string;
  /** Display sender for the backend, e.g. `Sepárame <noreply@separame.app>`. */
  mailFrom: string;
  /** SES configuration set used by every outgoing email (Cognito included). */
  configSetName: string;
  ssmPrefix: string;
  /** prod: RETAIN + deletion protection. dev: everything can be destroyed. */
  retain: boolean;
  removalPolicy: cdk.RemovalPolicy;
  turnstileSiteKey: string;
  /** prod fell back to the always-pass test key (reported as a synth warning). */
  turnstileTestKeyInProd: boolean;
  alertEmail: string;
  adminEmail: string;
  /** Allowed browser origins for the HTTP API. */
  corsOrigins: string[];
}

/** Validates the `-c stage=dev|prod` context value. */
export function parseStage(value: unknown): Stage {
  if (typeof value === 'string' && (STAGES as readonly string[]).includes(value)) return value as Stage;
  throw new Error(
    `Missing or invalid stage (got ${JSON.stringify(value)}). Pass -c stage=dev or -c stage=prod, ` +
      'e.g. `npx cdk synth --all -c stage=dev`.',
  );
}

/**
 * Turnstile site key (public). dev always uses Cloudflare's always-pass test
 * key; prod uses the real key committed in shared/infra.ts (public, so local and
 * CI deploys can't disagree). `-c turnstileSiteKey=…` overrides it, e.g. to
 * rotate the widget.
 */
function resolveTurnstileSiteKey(scope: Construct, stage: Stage): string {
  if (stage === 'dev') return TURNSTILE_TEST_KEYS.siteKey;
  const fromContext: unknown = scope.node.tryGetContext('turnstileSiteKey');
  return (typeof fromContext === 'string' && fromContext) || TURNSTILE_PROD_SITE_KEY;
}

export function stageConfig(scope: Construct, stage: Stage): StageConfig {
  const domains = STAGE_DOMAINS[stage];
  const isProd = stage === 'prod';
  const siteUrl = `https://${domains.site}`;
  const mailFromAddress = `noreply@${domains.mail}`;
  const prefix = `separame-${stage}`;
  const turnstileSiteKey = resolveTurnstileSiteKey(scope, stage);

  return {
    stage,
    prefix,
    region: REGION,
    siteDomain: domains.site,
    siteAliases: isProd ? [`www.${domains.site}`] : [],
    apiDomain: domains.api,
    mailDomain: domains.mail,
    siteUrl,
    apiUrl: `https://${domains.api}`,
    mailFromAddress,
    mailFrom: `Sepárame <${mailFromAddress}>`,
    configSetName: prefix,
    ssmPrefix: ssmPrefix(stage),
    retain: isProd,
    removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    turnstileSiteKey,
    turnstileTestKeyInProd: isProd && turnstileSiteKey === TURNSTILE_TEST_KEYS.siteKey,
    alertEmail: OPERATOR_EMAIL,
    adminEmail: OPERATOR_EMAIL,
    corsOrigins: isProd ? [siteUrl] : [siteUrl, ...DEV_LOCAL_ORIGINS],
  };
}

/** `Separame` + `Dev` + `Api` → `SeparameDevApi`. */
export function stackId(stage: Stage, name: string): string {
  return `Separame${stage.charAt(0).toUpperCase()}${stage.slice(1)}${name}`;
}
