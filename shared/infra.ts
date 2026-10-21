/**
 * Infrastructure constants shared by the CDK app (which creates the
 * resources) and the backend (which reads them). Changing a name here changes
 * it on both sides.
 *
 * ── DynamoDB single-table layout (`separame-<stage>`) ───────────────────────
 *
 *  PK                               SK                         item
 *  PRO#<proId>                      PROFILE                    ProProfile
 *  PRO#<proId>                      SUB                        subscription (trialEndsAt, paidUntil, priceVersionId, group?,
 *                                                              trialStartedAt, renewalNoticeFor, pendingNoticeId, lastPayment,
 *                                                              and copies of name/slug/title/email so the admin list is one query)
 *                                                              GSI1PK=SUBS  GSI1SK=<graceUntil>#<proId>  (admin list)
 *  PRO#<proId>                      SERVICE#<serviceId>        Service
 *  PRO#<proId>                      SETTINGS                   { schedule, rules }
 *  PRO#<proId>                      BLOCK#<blockId>            Block
 *  PRO#<proId>                      APPT#<apptId>              Appointment (+ lockBufferMin, lastChangedBy)
 *                                                              LSI1SK=APPT#<startISO>           (pro calendar by date)
 *                                                              GSI2PK=REMIND#<bogotaDate>  GSI2SK=<remindAtISO>#<proId>#<apptId>
 *                                                              (sparse: only while the 24 h reminder is pending)
 *  PRO#<proId>                      PAY#<createdAtISO>#<id>    Payment (admin-recorded or "Ya pagué" notice, with audit)
 *                                                              approved only: GSI1PK=PAYMENTS#<YYYY-MM>  GSI1SK=<paidAt>#<proId>#<id>
 *                                                              (monthly revenue in one query)
 *  PRO#<proId>                      CALSYNC                    { token, invitesEnabled, createdAt } — calendar sync settings
 *  CALFEED#<token>                  CALFEED                    { proId } — resolves the secret .ics feed URL (deleted on rotate)
 *  SLUG#<slug>                      SLUG                       { proId }  — uniqueness via conditional put
 *  LOCK#<proId>#<bogotaDate>        <HH:mm>                    { apptId } — 5-min double-booking locks (TTL: slot end + 7 days)
 *  OWNER#<cognitoSub>               OWNER                      { proId } — Cognito user → professional
 *  TRIAL#<sha256(email)>            TRIAL                      { proId, at } — one free trial per email
 *  PRICE                            PRICE#<priceId>            PriceVersion
 *  MIGRATION                        MIGRATION#<id>             PriceMigration
 *  EMAIL#<key>                      SENT                       email idempotency marker (TTL)
 *  SUPPRESS#<email>                 SUPPRESS                   bounced / complained address
 *  RATE#<scope>#<id>#<window>       RATE                       anti-spam counter (TTL)
 *
 *  TTL (`ttl`, epoch seconds) ONLY on ephemeral items: EMAIL, RATE, and LOCK once its slot is in the
 *  past (a past slot can never be booked again, so the lock is no longer needed). Appointments,
 *  payments and subscriptions never expire.
 */

export const ROOT_DOMAIN = 'separame.app';
export const HOSTED_ZONE_ID = 'Z047588122Q5AOQ1DFJL8';
export const REGION = 'us-east-1';

export const STAGE_DOMAINS = {
  dev: { site: 'dev.separame.app', api: 'api.dev.separame.app', mail: 'dev.separame.app' },
  prod: { site: 'separame.app', api: 'api.separame.app', mail: 'separame.app' },
} as const;

export const TABLE_KEYS = { pk: 'PK', sk: 'SK' } as const;
/** Admin listings: subscriptions ordered by graceUntil. */
export const GSI1 = { name: 'gsi1', pk: 'GSI1PK', sk: 'GSI1SK' } as const;
/** Sparse: appointment reminders still to send, bucketed per Bogotá day. */
export const GSI2 = { name: 'gsi2-reminders', pk: 'GSI2PK', sk: 'GSI2SK' } as const;
/** A professional's appointments ordered by start (local index on the PRO partition). */
export const LSI1 = { name: 'lsi1-start', sk: 'LSI1SK' } as const;
export const TTL_ATTRIBUTE = 'ttl';

/** Environment variable names every Lambda may read. */
export const ENV = {
  stage: 'STAGE',
  tableName: 'TABLE_NAME',
  siteUrl: 'SITE_URL',
  apiUrl: 'API_URL',
  siteBucket: 'SITE_BUCKET',
  siteDistributionId: 'SITE_DISTRIBUTION_ID',
  mailFrom: 'MAIL_FROM',
  mailConfigSet: 'MAIL_CONFIG_SET',
  userPoolId: 'USER_POOL_ID',
  ssmPrefix: 'SSM_PREFIX',
  turnstileSiteKey: 'TURNSTILE_SITE_KEY',
  /** Where "Ya pagué" notices and other operator alerts are emailed. */
  adminEmail: 'ADMIN_EMAIL',
} as const;

/** SSM Parameter Store names, relative to `/separame/<stage>`. SecureString unless noted. */
export const SSM_PARAMS = {
  turnstileSecret: '/turnstile/secret-key',
  /** Plain String with PaymentInstructions JSON (Nequi number, bank account, holder, note). */
  billingInstructions: '/billing/instructions',
  /** HMAC key for the client's cancel/reschedule links. */
  linkSigningSecret: '/links/signing-secret',
} as const;

export const ssmPrefix = (stage: 'dev' | 'prod') => `/separame/${stage}`;

/** Cognito group whose members can use /admin routes. */
export const ADMIN_GROUP = 'admin';

/** Site paths (CloudFront behaviors and the static profile pages). */
export const SITE_PATHS = {
  /** Professional panel + admin SPA (React), deployed under the `app/` prefix. */
  app: '/app/',
  /** Client cancel/reschedule page: /c/<token>. */
  manage: '/c/',
  /** File every /c/<token> request is rewritten to (built by frontend/booking). */
  manageIndex: '/c/index.html',
  /** Error page CloudFront serves for 403/404 (built by frontend/booking). */
  notFound: '/404.html',
  /** HTML shell the profile pages are generated from (built by frontend/booking). */
  bookingTemplate: '_templates/booking.html',
  /** Stable (unhashed) booking entry points referenced by every profile page. */
  bookingScript: '/b/booking.js',
  bookingStyles: '/b/booking.css',
  /** Placeholders in the template that stream-publish replaces. */
  templateHeadMarker: '<!--SEPARAME_HEAD-->',
  templateDataMarker: '<!--SEPARAME_DATA-->',
  /** id of the <script type="application/json"> holding { profile, config }. */
  dataScriptId: 'separame-data',
  /** Where the panel's runtime config (apiUrl, Cognito ids) is published by CDK. */
  appConfig: '/app/config.json',
} as const;

/**
 * Turnstile site key (PUBLIC — it ships inside every booking page) for prod.
 * Its secret pair lives in SSM `/separame/prod/turnstile/secret-key`; the two must
 * belong to the same Cloudflare widget or every booking fails the captcha.
 */
export const TURNSTILE_PROD_SITE_KEY = '0x4AAAAAAFeqxegjYOwLEBZf';

/** Cloudflare Turnstile test keys (always pass) — used by the dev stage and local dev. */
export const TURNSTILE_TEST_KEYS = {
  siteKey: '1x00000000000000000000AA',
  secretKey: '1x0000000000000000000000000000000AA',
} as const;
