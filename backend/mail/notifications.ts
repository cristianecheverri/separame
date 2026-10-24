import { CONFIRM_ACTION_PARAM } from '../../shared/api';
import type { ISODate, ISOInstant } from '../../shared/time';
import type { Appointment, Payment, PriceVersion, ProProfile, TeamRequest, WaitlistEntry } from '../../shared/types';
import { env } from '../lib/env';
import { manageTokenFor } from '../lib/tokens';
import { googleCalendarUrl, outlookCalendarUrl } from './calendar-links';
import { clientCalendarEvent, clientIcsFile, manageUrl } from './client-ics';
import { sendEmail, type CalendarInvite, type SendResult } from './sender';
import { proCalendarEmail, type ProCalendarKind } from './templates/pro-calendar';
import { waitlistJoinedEmail, waitlistOfferEmail } from './templates/waitlist';
import { bookingConfirmedEmail, type BookingEmailData } from './templates/booking-confirmed';
import { bookingChangedEmail, proBookingChangedEmail } from './templates/booking-changed';
import { clientCancelledEmail, proCancelledEmail, type CancelledData } from './templates/booking-cancelled';
import { manualPaymentReceiptEmail } from './templates/manual-payment-receipt';
import { priceMigrationNoticeEmail } from './templates/price-migration-notice';
import { proNewBookingEmail } from './templates/pro-new-booking';
import { referralRewardEmail, type ReferralRewardData } from './templates/referral-reward';
import { reminderEmail } from './templates/reminder-24h';
import { renewalNoticeEmail } from './templates/renewal-notice';
import { noticeAdminEmail, noticeReceivedEmail, noticeRejectedEmail } from './templates/payment-notice';
import { teamApprovedEmail, teamRejectedEmail, teamRequestAdminEmail } from './templates/team';
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

export { manageUrl };

const proInfo = (p: ProProfile) => ({
  name: p.name, title: p.title, neighborhood: p.neighborhood, address: p.address, city: p.city, slug: p.slug,
  ...(p.ownerId ? { agendaOf: p.name } : {}),
});

function icsAttachment(appt: Appointment, pro: ProProfile, link: string) {
  return { ...clientIcsFile(appt, pro, link), contentType: 'text/calendar; charset=UTF-8; method=PUBLISH' };
}

/** When the 24 h reminder will go out, or null when it is already too late for one. */
export function reminderAtFor(start: ISOInstant, now: Date): ISOInstant | null {
  const at = new Date(start).getTime() - DAY_MS;
  return at > now.getTime() ? new Date(at).toISOString() : null;
}

async function clientBookingData(appt: Appointment, pro: ProProfile, now: Date): Promise<BookingEmailData & { link: string }> {
  const link = manageUrl(await manageTokenFor(pro.id, appt.id, appt.end));
  const event = clientCalendarEvent(appt, pro, link);
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

export async function sendProCancelled(appt: Appointment, pro: ProProfile, invite?: CalendarInvite): Promise<SendResult> {
  return sendEmail({ ...proCancelledEmail(cancelledData(appt, pro)), to: pro.email, replyTo: appt.client.email || undefined, invite });
}

export async function sendProNewBooking(appt: Appointment, pro: ProProfile, invite?: CalendarInvite): Promise<SendResult> {
  return sendEmail({
    ...proNewBookingEmail({
      siteUrl: env.siteUrl(), pro: proInfo(pro), client: appt.client, serviceName: appt.serviceName,
      durationMin: appt.durationMin, priceCop: appt.priceCop, priceDisplay: appt.priceDisplay, start: appt.start,
    }),
    to: pro.email,
    replyTo: appt.client.email || undefined,
    invite,
  });
}

export async function sendProChanged(appt: Appointment, previousStart: ISOInstant, pro: ProProfile, invite?: CalendarInvite): Promise<SendResult> {
  return sendEmail({
    ...proBookingChangedEmail({
      siteUrl: env.siteUrl(), pro: proInfo(pro), clientName: appt.client.name, serviceName: appt.serviceName,
      durationMin: appt.durationMin, start: appt.start, previousStart,
    }),
    to: pro.email,
    replyTo: appt.client.email || undefined,
    invite,
  });
}

/** Carrier for the invitation when the pro made the change himself. */
export async function sendProCalendarNotice(appt: Appointment, pro: ProProfile, kind: ProCalendarKind, invite: CalendarInvite): Promise<SendResult> {
  return sendEmail({
    ...proCalendarEmail({
      siteUrl: env.siteUrl(), kind, clientName: appt.client.name, serviceName: appt.serviceName,
      durationMin: appt.durationMin, start: appt.start, agendaOf: pro.ownerId ? pro.name : undefined,
    }),
    to: pro.email,
    replyTo: operatorReplyTo(),
    invite,
  });
}

export async function sendReminder(appt: Appointment, pro: ProProfile): Promise<SendResult> {
  if (!appt.client.email) return 'skipped';
  const link = manageUrl(await manageTokenFor(pro.id, appt.id, appt.end));
  return sendEmail({
    ...reminderEmail({
      siteUrl: env.siteUrl(), clientName: appt.client.name, pro: proInfo(pro), serviceName: appt.serviceName,
      durationMin: appt.durationMin, start: appt.start, manageUrl: link,
      confirmUrl: `${link}?${CONFIRM_ACTION_PARAM}`, clientConfirmation: appt.clientConfirmation ?? 'pending',
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

export async function sendManualPaymentReceipt(input: {
  profile: ProProfile; payment: Payment; price: PriceVersion; referralMonths?: number; accessUntil?: ISOInstant;
}): Promise<SendResult> {
  return sendEmail({
    ...manualPaymentReceiptEmail({
      siteUrl: env.siteUrl(), name: input.profile.name, payment: input.payment, price: input.price,
      referralMonths: input.referralMonths, accessUntil: input.accessUntil,
    }),
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

/** "¡Ganaste un mes gratis!" to the professional whose referral link brought a paying account. */
export async function sendReferralReward(input: { profile: ProProfile } & Omit<ReferralRewardData, 'siteUrl' | 'name'>): Promise<SendResult> {
  const { profile, ...data } = input;
  return sendEmail({
    ...referralRewardEmail({ siteUrl: env.siteUrl(), name: profile.name, ...data }),
    to: profile.email,
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

// ── Team plan ──────────────────────────────────────────────────────────────

/** Operator alert; skipped (logged) when ADMIN_EMAIL isn't configured. */
export async function sendTeamRequestToAdmin(input: { profile: ProProfile; request: TeamRequest }): Promise<SendResult> {
  const to = env.adminEmail();
  if (!to) {
    log.warn('ADMIN_EMAIL not set: team request alert skipped', { proId: input.profile.id });
    return 'skipped';
  }
  return sendEmail({ ...teamRequestAdminEmail({ siteUrl: env.siteUrl(), ...input }), to, replyTo: input.profile.email });
}

export async function sendTeamApproved(input: {
  profile: ProProfile; teamName: string; teamUrl: string; seats: number; extraProfessionalCop: number | null;
}): Promise<SendResult> {
  const { profile, ...data } = input;
  return sendEmail({ ...teamApprovedEmail({ siteUrl: env.siteUrl(), name: profile.name, ...data }), to: profile.email, replyTo: operatorReplyTo() });
}

export async function sendTeamRejected(input: { profile: ProProfile; teamName: string; reason: string }): Promise<SendResult> {
  const { profile, ...data } = input;
  return sendEmail({ ...teamRejectedEmail({ siteUrl: env.siteUrl(), name: profile.name, ...data }), to: profile.email, replyTo: operatorReplyTo() });
}

// ── Waitlist ───────────────────────────────────────────────────────────────

export async function sendWaitlistJoined(input: { entry: WaitlistEntry; pro: ProProfile; leaveUrl: string }): Promise<SendResult> {
  return sendEmail({
    ...waitlistJoinedEmail({
      siteUrl: env.siteUrl(), clientName: input.entry.client.name, pro: proInfo(input.pro), serviceName: input.entry.serviceName,
      dates: input.entry.dates, leaveUrl: input.leaveUrl,
    }),
    to: input.entry.client.email,
    replyTo: input.pro.email,
  });
}

export async function sendWaitlistOffer(input: {
  entry: WaitlistEntry; pro: ProProfile; date: ISODate; slots: ISOInstant[]; leaveUrl: string;
}): Promise<SendResult> {
  return sendEmail({
    ...waitlistOfferEmail({
      siteUrl: env.siteUrl(), clientName: input.entry.client.name, pro: proInfo(input.pro), serviceId: input.entry.serviceId,
      serviceName: input.entry.serviceName, date: input.date, slots: input.slots, leaveUrl: input.leaveUrl,
    }),
    to: input.entry.client.email,
    replyTo: input.pro.email,
  });
}
