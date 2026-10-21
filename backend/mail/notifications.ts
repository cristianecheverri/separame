import { ROOT_DOMAIN, SITE_PATHS } from '../../shared/infra';
import type { ISODate, ISOInstant } from '../../shared/time';
import type { Appointment, Payment, PriceVersion, ProProfile } from '../../shared/types';
import { env } from '../lib/env';
import { manageTokenFor } from '../lib/tokens';
import { googleCalendarUrl, outlookCalendarUrl, type CalendarEvent } from './calendar-links';
import { buildIcs } from './ics';
import { sendEmail, type SendResult } from './sender';
import { bookingConfirmedEmail, type BookingEmailData } from './templates/booking-confirmed';
import { bookingChangedEmail, proBookingChangedEmail } from './templates/booking-changed';
import { clientCancelledEmail, proCancelledEmail, type CancelledData } from './templates/booking-cancelled';
import { manualPaymentReceiptEmail } from './templates/manual-payment-receipt';
import { priceMigrationNoticeEmail } from './templates/price-migration-notice';
import { proNewBookingEmail } from './templates/pro-new-booking';
import { reminderEmail } from './templates/reminder-24h';
import { renewalNoticeEmail } from './templates/renewal-notice';
import { whereText } from './templates/common';
import { noticeAdminEmail, noticeReceivedEmail, noticeRejectedEmail } from './templates/payment-notice';
import { log } from '../lib/logger';

/**
 * Glue between domain objects and templates: builds the template data
 * (manage link, calendar links, .ics), picks the recipient and Reply-To
 * (client emails reply to the professional; pro emails to support) and sends.
 */

const DAY_MS = 86_400_000;

/**
 * Reply-To of emails to professionals ("responde este correo"): the operator
 * inbox (`ADMIN_EMAIL`); there is no inbound mailbox at soporte@ yet.
 */
const operatorReplyTo = (): string | undefined => env.adminEmail();

export const manageUrl = (token: string) => `${env.siteUrl()}${SITE_PATHS.manage}${token}`;

const proInfo = (p: ProProfile) => ({ name: p.name, title: p.title, neighborhood: p.neighborhood, address: p.address, city: p.city, slug: p.slug });

function calendarEvent(appt: Appointment, pro: ProProfile, link: string): CalendarEvent {
  const location = whereText(pro);
  return {
    title: `${appt.serviceName} con ${pro.name}`,
    start: appt.start,
    end: appt.end,
    details: `Cita separada en Sepárame.\nPara cambiarla o cancelarla: ${link}`,
    location,
  };
}

function icsAttachment(appt: Appointment, pro: ProProfile, link: string) {
  const event = calendarEvent(appt, pro, link);
  return {
    filename: `cita-${pro.slug}.ics`,
    contentType: 'text/calendar; charset=UTF-8; method=PUBLISH',
    content: buildIcs({
      uid: `${appt.id}@${ROOT_DOMAIN}`,
      start: appt.start,
      end: appt.end,
      summary: event.title,
      description: event.details,
      location: event.location,
      sequence: Math.floor(new Date(appt.updatedAt).getTime() / 1000),
      url: link,
    }),
  };
}

/** When the 24 h reminder will go out, or null when it is already too late for one. */
export function reminderAtFor(start: ISOInstant, now: Date): ISOInstant | null {
  const at = new Date(start).getTime() - DAY_MS;
  return at > now.getTime() ? new Date(at).toISOString() : null;
}

async function clientBookingData(appt: Appointment, pro: ProProfile, now: Date): Promise<BookingEmailData & { link: string }> {
  const link = manageUrl(await manageTokenFor(pro.id, appt.id, appt.end));
  const event = calendarEvent(appt, pro, link);
  return {
    link,
    siteUrl: env.siteUrl(),
    clientName: appt.client.name,
    pro: proInfo(pro),
    serviceName: appt.serviceName,
    durationMin: appt.durationMin,
    start: appt.start,
    manageUrl: link,
    googleUrl: googleCalendarUrl(event),
    outlookUrl: outlookCalendarUrl(event),
    reminderAt: reminderAtFor(appt.start, now),
  };
}

export async function sendClientConfirmation(appt: Appointment, pro: ProProfile, now: Date = new Date()): Promise<SendResult> {
  if (!appt.client.email) return 'skipped';
  const data = await clientBookingData(appt, pro, now);
  return sendEmail({
    ...bookingConfirmedEmail(data),
    to: appt.client.email,
    replyTo: pro.email,
    attachments: [icsAttachment(appt, pro, data.link)],
  });
}

export async function sendClientChanged(appt: Appointment, previousStart: ISOInstant, pro: ProProfile, now: Date = new Date()): Promise<SendResult> {
  if (!appt.client.email) return 'skipped';
  const data = await clientBookingData(appt, pro, now);
  return sendEmail({
    ...bookingChangedEmail({ ...data, previousStart }),
    to: appt.client.email,
    replyTo: pro.email,
    attachments: [icsAttachment(appt, pro, data.link)],
  });
}

const cancelledData = (appt: Appointment, pro: ProProfile): CancelledData => ({
  siteUrl: env.siteUrl(),
  pro: proInfo(pro),
  clientName: appt.client.name,
  serviceName: appt.serviceName,
  durationMin: appt.durationMin,
  start: appt.start,
  reason: appt.cancelReason,
});

export async function sendClientCancelled(appt: Appointment, pro: ProProfile): Promise<SendResult> {
  if (!appt.client.email) return 'skipped';
  return sendEmail({ ...clientCancelledEmail(cancelledData(appt, pro)), to: appt.client.email, replyTo: pro.email });
}

export async function sendProCancelled(appt: Appointment, pro: ProProfile): Promise<SendResult> {
  return sendEmail({ ...proCancelledEmail(cancelledData(appt, pro)), to: pro.email, replyTo: appt.client.email || undefined });
}

export async function sendProNewBooking(appt: Appointment, pro: ProProfile): Promise<SendResult> {
  return sendEmail({
    ...proNewBookingEmail({
      siteUrl: env.siteUrl(), pro: proInfo(pro), client: appt.client, serviceName: appt.serviceName,
      durationMin: appt.durationMin, priceCop: appt.priceCop, start: appt.start,
    }),
    to: pro.email,
    replyTo: appt.client.email || undefined,
  });
}

export async function sendProChanged(appt: Appointment, previousStart: ISOInstant, pro: ProProfile): Promise<SendResult> {
  return sendEmail({
    ...proBookingChangedEmail({
      siteUrl: env.siteUrl(), pro: proInfo(pro), clientName: appt.client.name, serviceName: appt.serviceName,
      durationMin: appt.durationMin, start: appt.start, previousStart,
    }),
    to: pro.email,
    replyTo: appt.client.email || undefined,
  });
}

export async function sendReminder(appt: Appointment, pro: ProProfile): Promise<SendResult> {
  if (!appt.client.email) return 'skipped';
  const link = manageUrl(await manageTokenFor(pro.id, appt.id, appt.end));
  return sendEmail({
    ...reminderEmail({
      siteUrl: env.siteUrl(), clientName: appt.client.name, pro: proInfo(pro), serviceName: appt.serviceName,
      durationMin: appt.durationMin, start: appt.start, manageUrl: link,
    }),
    to: appt.client.email,
    replyTo: pro.email,
  });
}

export async function sendRenewalNotice(input: { email: string; name: string; accessUntil: ISOInstant; isTrial: boolean }): Promise<SendResult> {
  return sendEmail({
    ...renewalNoticeEmail({ siteUrl: env.siteUrl(), name: input.name, accessUntil: input.accessUntil, isTrial: input.isTrial }),
    to: input.email,
    replyTo: operatorReplyTo(),
  });
}

export async function sendManualPaymentReceipt(input: { profile: ProProfile; payment: Payment; price: PriceVersion }): Promise<SendResult> {
  return sendEmail({
    ...manualPaymentReceiptEmail({ siteUrl: env.siteUrl(), name: input.profile.name, payment: input.payment, price: input.price }),
    to: input.profile.email,
    replyTo: operatorReplyTo(),
  });
}

export async function sendMigrationNotice(input: {
  email: string; name: string; effectiveDate: ISODate; from: PriceVersion; to: PriceVersion;
}): Promise<SendResult> {
  return sendEmail({
    ...priceMigrationNoticeEmail({
      siteUrl: env.siteUrl(), name: input.name, effectiveDate: input.effectiveDate,
      fromMonthlyCop: input.from.monthlyCop, toMonthlyCop: input.to.monthlyCop,
    }),
    to: input.email,
    replyTo: operatorReplyTo(),
  });
}

// ── "Ya pagué" notices ─────────────────────────────────────────────────────

/** Operator alert; skipped (logged) when ADMIN_EMAIL isn't configured. */
export async function sendNoticeToAdmin(input: { profile: ProProfile; payment: Payment; price: PriceVersion }): Promise<SendResult> {
  const to = env.adminEmail();
  if (!to) {
    log.warn('ADMIN_EMAIL not set: payment notice alert skipped', { proId: input.profile.id });
    return 'skipped';
  }
  return sendEmail({
    ...noticeAdminEmail({ siteUrl: env.siteUrl(), profile: input.profile, payment: input.payment, price: input.price }),
    to,
    replyTo: input.profile.email,
  });
}

export async function sendNoticeReceived(input: { profile: ProProfile; payment: Payment }): Promise<SendResult> {
  return sendEmail({
    ...noticeReceivedEmail({ siteUrl: env.siteUrl(), name: input.profile.name, payment: input.payment }),
    to: input.profile.email,
    replyTo: operatorReplyTo(),
  });
}

export async function sendNoticeRejected(input: { profile: ProProfile; payment: Payment }): Promise<SendResult> {
  return sendEmail({
    ...noticeRejectedEmail({ siteUrl: env.siteUrl(), name: input.profile.name, payment: input.payment }),
    to: input.profile.email,
    replyTo: operatorReplyTo(),
  });
}
