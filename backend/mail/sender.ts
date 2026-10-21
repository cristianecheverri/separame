import { randomBytes } from 'node:crypto';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import { ddb, getItem, isConditionalFailure, table, ttlInDays } from '../lib/dynamo';
import { env } from '../lib/env';
import { emailKey, suppressKey } from '../lib/keys';
import { log } from '../lib/logger';
import type { RenderedEmail } from './layout';


/**
 * Outgoing email through SES v2 with the stage's configuration set (bounces
 * and complaints flow back to ses-feedback). Addresses in `SUPPRESS#<email>`
 * are skipped — the account's SES reputation is shared with other projects.
 * Emails with an attachment (.ics) are sent as raw MIME; the rest as simple
 * content. `sendOnce` adds an idempotency marker (`EMAIL#<key>`, TTL).
 */

const ses = new SESv2Client({});
const FROM_NAME = 'Sepárame';
const MARKER_TTL_DAYS = 30;

export interface Attachment {
  filename: string;
  contentType: string;
  content: string;
}

/** Calendar invitation (REQUEST / CANCEL): inline text/calendar part + `invite.ics` attachment. */
export interface CalendarInvite {
  method: 'REQUEST' | 'CANCEL';
  content: string;
}

export interface OutgoingEmail extends RenderedEmail {
  to: string;
  replyTo?: string;
  attachments?: Attachment[];
  invite?: CalendarInvite;
}

export type SendResult = 'sent' | 'suppressed' | 'skipped';

/** RFC 2047 encoded-words (≤ 75 chars each), only when the text isn't plain ASCII. */
export function encodeHeader(text: string): string {
  if (/^[\x20-\x7e]*$/.test(text)) return text;
  const words: string[] = [];
  let chunk = '';
  for (const ch of text) {
    if (Buffer.byteLength(chunk + ch, 'utf8') > 45) {
      words.push(chunk);
      chunk = '';
    }
    chunk += ch;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, 'utf8').toString('base64')}?=`).join('\r\n ');
}

/**
 * `MAIL_FROM` may be a bare address or `Sepárame <noreply@…>`; either way the
 * display name is RFC 2047-encoded (SES rejects raw non-ASCII in headers).
 */
export function formatFrom(mailFrom: string): string {
  const match = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(mailFrom);
  const name = match ? match[1].trim() || FROM_NAME : FROM_NAME;
  const address = match ? match[2].trim() : mailFrom.trim();
  return `${encodeHeader(name)} <${address}>`;
}

export const fromAddress = (): string => formatFrom(env.mailFrom());

const base64Lines = (text: string) => Buffer.from(text, 'utf8').toString('base64').replace(/.{1,76}/g, '$&\r\n').trimEnd();

/**
 * multipart/mixed( multipart/alternative(text, html[, text/calendar]), attachments… ).
 * Gmail and Outlook only show an invitation (with the event card) when the
 * text/calendar part sits inside the alternative AND an .ics is attached.
 */
export function buildRawMessage(email: OutgoingEmail, from: string): string {
  const mixed = `mixed_${randomBytes(8).toString('hex')}`;
  const alt = `alt_${randomBytes(8).toString('hex')}`;
  const headers = [
    `From: ${from}`,
    `To: ${email.to}`,
    ...(email.replyTo ? [`Reply-To: ${email.replyTo}`] : []),
    `Subject: ${encodeHeader(email.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
  ];
  const parts = [
    `--${mixed}`,
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    '',
    `--${alt}`,
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(email.text),
    `--${alt}`,
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    base64Lines(email.html),
  ];
  if (email.invite) {
    parts.push(
      `--${alt}`,
      `Content-Type: text/calendar; method=${email.invite.method}; charset=UTF-8`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(email.invite.content),
    );
  }
  parts.push(`--${alt}--`);
  const attachments = [
    ...(email.attachments ?? []),
    ...(email.invite ? [{ filename: 'invite.ics', contentType: 'application/ics', content: email.invite.content }] : []),
  ];
  for (const a of attachments) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.contentType}; name="${a.filename}"`,
      `Content-Disposition: attachment; filename="${a.filename}"`,
      'Content-Transfer-Encoding: base64',
      '',
      base64Lines(a.content),
    );
  }
  parts.push(`--${mixed}--`, '');
  return [...headers, '', ...parts].join('\r\n');
}

export async function isSuppressed(address: string): Promise<boolean> {
  return !!(await getItem(suppressKey(address)));
}

export async function sendEmail(email: OutgoingEmail): Promise<SendResult> {
  const to = email.to.trim().toLowerCase();
  if (!to) return 'skipped';
  if (await isSuppressed(to)) {
    log.info('email suppressed', { subjectKind: email.subject.split(' ')[0] });
    return 'suppressed';
  }
  const from = fromAddress();
  const configSet = env.mailConfigSet();
  if (email.attachments?.length || email.invite) {
    await ses.send(new SendEmailCommand({
      ConfigurationSetName: configSet,
      Content: { Raw: { Data: Buffer.from(buildRawMessage({ ...email, to }, from), 'utf8') } },
    }));
  } else {
    await ses.send(new SendEmailCommand({
      FromEmailAddress: from,
      Destination: { ToAddresses: [to] },
      ReplyToAddresses: email.replyTo ? [email.replyTo] : undefined,
      ConfigurationSetName: configSet,
      Content: {
        Simple: {
          Subject: { Data: email.subject, Charset: 'UTF-8' },
          Body: { Html: { Data: email.html, Charset: 'UTF-8' }, Text: { Data: email.text, Charset: 'UTF-8' } },
        },
      },
    }));
  }
  return 'sent';
}

/**
 * Runs `send` at most once per `key`: a conditional marker is written first;
 * if sending fails the marker is removed so a retry can send again.
 * Returns false when the key was already used.
 */
export async function sendOnce(key: string, send: () => Promise<unknown>, now: Date = new Date(), ttlDays = MARKER_TTL_DAYS): Promise<boolean> {
  try {
    await ddb.send(new PutCommand({
      TableName: table(),
      Item: { ...emailKey(key), at: now.toISOString(), ttl: ttlInDays(ttlDays, now) },
      ConditionExpression: 'attribute_not_exists(PK)',
    }));
  } catch (err) {
    if (isConditionalFailure(err)) return false;
    throw err;
  }
  try {
    await send();
    return true;
  } catch (err) {
    await ddb.send(new DeleteCommand({ TableName: table(), Key: emailKey(key) })).catch(() => undefined);
    throw err;
  }
}
