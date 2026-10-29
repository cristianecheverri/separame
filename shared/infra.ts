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
 *                                                              referralCode, referredBy { proId, code }, referralRewardedAt,
 *                                                              and copies of name/slug/title/email so the admin list is one query)
 *                                                              GSI1PK=SUBS  GSI1SK=<graceUntil>#<proId>  (admin list)
 *  PRO#<proId>                      SERVICE#<serviceId>        Service (+ priceDisplay: fixed | free | agreed | hidden; missing = legacy,
 *                                                              derived from priceCop. Appointments snapshot it too.)
 *  PRO#<proId>                      SETTINGS                   { schedule, rules }
 *  PRO#<proId>                      BLOCK#<blockId>            Block
 *  PRO#<proId>                      APPT#<apptId>              Appointment (+ lockBufferMin, lastChangedBy)
 *                                                              LSI1SK=APPT#<startISO>           (pro calendar by date)
 *                                                              GSI2PK=REMIND#<bogotaDate>  GSI2SK=<remindAtISO>#<proId>#<apptId>
 *                                                              (sparse: only while the 24 h reminder is pending and the client gave an email)
 *  PRO#<proId>                      PAY#<createdAtISO>#<id>    Payment (admin-recorded or "Ya pagué" notice, with audit)
 *                                                              approved only: GSI1PK=PAYMENTS#<YYYY-MM>  GSI1SK=<paidAt>#<proId>#<id>
 *                                                              (monthly revenue in one query)
 *                                                              source `referral` = "Mes gratis por referido" (courtesy, amount 0, 1 month)
 *  PRO#<referrerId>                 REFERRAL#<referredProId>   ReferralRecord: an account that signed up with this pro's link
 *                                                              (state registered | rewarded | saved; name/title snapshot, trialEndsAt,
 *                                                              paidMonths, paidAt, rewardedAt, appliedAt). `saved` = month waiting for
 *                                                              the referrer's next approved payment (no counter: these items ARE the pending months)
 *  PRO#<ownerId>                    TEAM                       { name, slug, seats, memberIds[], memberSlugs[], createdAt, updatedAt } — team plan
 *                                                              GSI1PK=TEAMS  GSI1SK=<createdAt>#<ownerId>  (admin list, sitemap)
 *  PRO#<ownerId>                    TEAMREQ                    TeamRequest (latest one); GSI1PK=TEAMREQS GSI1SK=<createdAt>#<ownerId> only while pending
 *  PRO#<ownerId>                    TEAMREQ#<createdAt>        immutable copy of a reviewed request replaced by a newer one (audit)
 *  PRO#<memberId>                   PROFILE                    a team member: ProProfile + ownerId, no OWNER/SUB/TRIAL items (pays and is managed
 *                                                              through the owner; docs/team-plan.md)
 *  PRO#<proId>                      CALSYNC                    { token, invitesEnabled, createdAt } — calendar sync settings
 *  PRO#<proId>                      CLIENT#<clientKey>         ClientRecord (aggregates from appointment events + notes)
 *  PRO#<proId>                      WAIT#<entryId>             WaitlistEntry (TTL: last date + 1 day)
 *  PRO#<proId>                      PUSH#<sha256(endpoint)>    web push subscription of one device
 *  PRO#<proId>                      FEEDBACK#<createdAtISO>    { kind, message, page? } — «Ayúdanos a mejorar» (also emailed to ADMIN_EMAIL)
 *  PRO#<proId>                      HOLD#<holdId>              { serviceId, start, end, bufferMin, expiresAt (epoch ms) } — an hour a
 *                                                              visitor of the booking page is holding (busy for everyone else
 *                                                              until expiresAt; TTL: expiresAt + 1 h)
 *  CALFEED#<token>                  CALFEED                    { proId } — resolves the secret .ics feed URL (deleted on rotate)
 *  SLUG#<slug>                      SLUG                       { proId }  — uniqueness via conditional put
 *                                                              or { teamOwnerId } for a team page (/<teamSlug>)
 *  LOCK#<proId>#<bogotaDate>        <HH:mm>                    { apptId } — 5-min double-booking locks (TTL: slot end + 7 days)
 *                                                              or { holdId, holdExpiresAt (epoch ms) } while a HOLD owns the unit
 *                                                              (free again once it expires; TTL: expiresAt + 1 h)
 *  OWNER#<cognitoSub>               OWNER                      { proId } — Cognito user → professional
 *  TRIAL#<sha256(email)>            TRIAL                      { proId, at } — one free trial per email
 *  REFCODE#<code>                   REFCODE                    { proId, createdAt } — referral code → referrer (immutable, conditional put)
 *  REFREWARD#<referredProId>        REFREWARD                  { referrerProId, paymentId, outcome, at } — one reward per referred
 *                                                              account, written conditionally in the payment transaction (never expires)
 *  REFSIGNUP#<sha256(email)>        REFSIGNUP                  { code, at } — referral code a sign-up came with (pre sign-up trigger,
 *                                                              Cognito clientMetadata), read at onboarding (TTL: 30 days)
 *  PRICE                            PRICE#<priceId>            PriceVersion
 *  SITEASSETS                       SITEASSETS                 { builds: { <assetDir>: buildId }, lastUsed: { <bucketKey>: ISO }, checkedAt,
 *                                                              cleanedAt } — old hashed site assets cleanup (shared/site-assets.ts)
 *  MIGRATION                        MIGRATION#<id>             PriceMigration
 *  EMAIL#<key>                      SENT                       email idempotency marker (TTL)
 *  IDEMP#<proId>#<idempotencyKey>   IDEMP                      { apptId, start, serviceId } — public booking retry marker,
 *                                                              written in the booking transaction (TTL: 24 h)
 *  SUPPRESS#<email>                 SUPPRESS                   bounced / complained address
 *  RATE#<scope>#<id>#<window>       RATE                       anti-spam counter (TTL)
 *
 *  Internal attributes: CLIENT items keep `appts` (≤ 500 per client; older ones summed into
 *  `archived`), `contactAt` and an optimistic `version`; WAIT items keep `offeredAt`; SETTINGS keeps
 *  `clientsBackfilledAt` + `clientsBackfillVersion` (lazy client backfill done). A deleted client's appointments keep
 *  `clientKey = 'deleted'` with the contact scrubbed.
 *
 *  clientKey = first 24 hex chars of sha256('tel:' + phone), or of sha256(normalized email) when
 *  there's no phone (helper `clientKeyOf` in shared/clients.ts; phone first because it is required
 *  on public bookings and the email is optional); '' when the pro created the appointment with a
 *  name only — such appointments have no CLIENT record (never keyed by name). SETTINGS keeps
 *  `clientsBackfillVersion`: when it is behind CLIENTS_BACKFILL_VERSION the next clients-page visit
 *  re-keys appointments/WAIT items and rebuilds the records (notes carried over).
 *
 *  TTL (`ttl`, epoch seconds) ONLY on ephemeral items: EMAIL, RATE, IDEMP, REFSIGNUP, HOLD, WAIT (after its last date), BLOCK (30 days after it
 *  ended: a past block never affects availability, so the blocks query stays bounded), and LOCK once its slot is in the
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
  /** VAPID key pair for web push to the pro's devices (public = plain String). */
  webPushPublicKey: '/webpush/public-key',
  webPushPrivateKey: '/webpush/private-key',
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
  /** Waitlist "leave" page from the offer emails: /w/<token> → /w/index.html. */
  waitlistLeave: '/w/',
  waitlistLeaveIndex: '/w/index.html',
  /** Error page CloudFront serves for 403/404 (built by frontend/booking). */
  notFound: '/404.html',
  /** HTML shell the profile pages are generated from (built by frontend/booking). */
  bookingTemplate: '_templates/booking.html',
  /** Landing (/) template with price slots; the backend renders it into `landingPage` (see backend/services/landing.ts). */
  landingTemplate: '_templates/landing.html',
  landingPage: 'index.html',
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
