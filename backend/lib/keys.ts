import { bogotaDate, bogotaTime, type ISOInstant } from '../../shared/time';

/**
 * DynamoDB single-table key builders. Centralizing them keeps the item-shape
 * conventions in one place — the layout is documented in `shared/infra.ts`.
 */

export const proPk = (proId: string) => `PRO#${proId}`;
export const PROFILE = 'PROFILE';
export const SUB = 'SUB';
export const SETTINGS = 'SETTINGS';

export const SERVICE_PREFIX = 'SERVICE#';
export const serviceSk = (serviceId: string) => `${SERVICE_PREFIX}${serviceId}`;
export const BLOCK_PREFIX = 'BLOCK#';
export const blockSk = (blockId: string) => `${BLOCK_PREFIX}${blockId}`;
export const APPT_PREFIX = 'APPT#';
export const apptSk = (apptId: string) => `${APPT_PREFIX}${apptId}`;
export const PAY_PREFIX = 'PAY#';
export const paySk = (createdAt: ISOInstant, paymentId: string) => `${PAY_PREFIX}${createdAt}#${paymentId}`;

export const profileKey = (proId: string) => ({ PK: proPk(proId), SK: PROFILE });
export const subKey = (proId: string) => ({ PK: proPk(proId), SK: SUB });
export const settingsKey = (proId: string) => ({ PK: proPk(proId), SK: SETTINGS });
export const serviceKey = (proId: string, serviceId: string) => ({ PK: proPk(proId), SK: serviceSk(serviceId) });
export const blockKey = (proId: string, blockId: string) => ({ PK: proPk(proId), SK: blockSk(blockId) });
export const apptKey = (proId: string, apptId: string) => ({ PK: proPk(proId), SK: apptSk(apptId) });

/** LSI1 sort key: a pro's appointments ordered by start instant. */
export const apptStartSk = (start: ISOInstant) => `${APPT_PREFIX}${start}`;

/** GSI1 (admin listings): every subscription, ordered by when bookings stop. */
export const SUBS_GSI1PK = 'SUBS';
export const subGsi1Sk = (graceUntil: ISOInstant, proId: string) => `${graceUntil}#${proId}`;
/**
 * GSI1 reuse: approved payments bucketed by Bogotá month of `paidAt`, so the
 * admin's monthly revenue is one query instead of one per professional.
 */
export const paymentsGsi1Pk = (yearMonth: string) => `PAYMENTS#${yearMonth}`;
export const paymentGsi1Sk = (paidAt: ISOInstant, proId: string, paymentId: string) => `${paidAt}#${proId}#${paymentId}`;

/** GSI2 (sparse): 24 h reminders still pending, bucketed per Bogotá day of `remindAt`. */
export const remindPk = (remindAt: ISOInstant) => `REMIND#${bogotaDate(remindAt)}`;
export const remindPkForDate = (date: string) => `REMIND#${date}`;
export const remindSk = (remindAt: ISOInstant, proId: string, apptId: string) => `${remindAt}#${proId}#${apptId}`;

export const slugKey = (slug: string) => ({ PK: `SLUG#${slug}`, SK: 'SLUG' });
export const ownerKey = (cognitoSub: string) => ({ PK: `OWNER#${cognitoSub}`, SK: 'OWNER' });
export const trialKey = (emailHash: string) => ({ PK: `TRIAL#${emailHash}`, SK: 'TRIAL' });

/**
 * One lock per 5-minute unit an appointment occupies (Bogotá day + wall-clock
 * time). Locks carry `ttl` = slot end + buffer + 7 days (see `lockTtlFor` in
 * services/appointments.ts): once the slot is in the past it can never be
 * booked again, so the lock can safely expire.
 */
export const lockKey = (proId: string, unit: ISOInstant) => ({
  PK: `LOCK#${proId}#${bogotaDate(unit)}`,
  SK: bogotaTime(unit),
});

export const PRICE_PK = 'PRICE';
export const PRICE_PREFIX = 'PRICE#';
export const priceKey = (priceId: string) => ({ PK: PRICE_PK, SK: `${PRICE_PREFIX}${priceId}` });

export const MIGRATION_PK = 'MIGRATION';
export const MIGRATION_PREFIX = 'MIGRATION#';
export const migrationKey = (id: string) => ({ PK: MIGRATION_PK, SK: `${MIGRATION_PREFIX}${id}` });

export const emailKey = (key: string) => ({ PK: `EMAIL#${key}`, SK: 'SENT' });
export const suppressKey = (email: string) => ({ PK: `SUPPRESS#${email.trim().toLowerCase()}`, SK: 'SUPPRESS' });
export const rateKey = (scope: string, id: string, window: string) => ({ PK: `RATE#${scope}#${id}#${window}`, SK: 'RATE' });
