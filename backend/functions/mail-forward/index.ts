import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { SendEmailCommand, SESv2Client } from '@aws-sdk/client-sesv2';
import type { S3Event } from 'aws-lambda';
import { log } from '../../lib/logger';

/**
 * soporte@separame.app (prod): SES receives the message, stores it raw in S3,
 * and this Lambda (S3 put) re-sends it to the operator's inbox. The From must be
 * our verified domain, so it becomes «Sepárame · soporte» <soporte@…> with
 * Reply-To = whoever wrote: answering goes straight back to them. Messages SES
 * flags as spam or virus are dropped (logged). Same pattern as Cartazos.
 */

const s3 = new S3Client({});
const ses = new SESv2Client({});

const FROM = process.env.MAIL_FROM ?? '';
const FORWARD_TO = process.env.FORWARD_TO ?? '';
const CONFIG_SET = process.env.SES_CONFIG_SET;

/** Headers that can't survive the re-send (sender identity, original signatures, SES receipt). */
const DROP = new Set(['from', 'return-path', 'sender', 'reply-to', 'dkim-signature', 'message-id', 'x-ses-receipt', 'x-ses-dkim-signature']);

interface Header {
  name: string;
  raw: string;
}

/** Raw header lines, folded continuations (leading space/tab) kept with their header. */
export function parseHeaders(block: string): Header[] {
  const out: Header[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (/^[ \t]/.test(line) && out.length) out[out.length - 1].raw += `\r\n${line}`;
    else out.push({ name: /^([\x21-\x39\x3b-\x7e]+):/.exec(line)?.[1].toLowerCase() ?? '', raw: line });
  }
  return out;
}

const valueOf = (headers: Header[], name: string) => headers.find((h) => h.name === name)?.raw.replace(/^[^:]+:\s*/, '').trim() ?? '';

/** The message ready to re-send, or null when SES judged it spam / a virus. */
export function rewrite(raw: string, from: string): string | null {
  const sep = raw.includes('\r\n\r\n') ? '\r\n\r\n' : '\n\n';
  const at = raw.indexOf(sep);
  const headers = parseHeaders(at >= 0 ? raw.slice(0, at) : raw);
  const body = at >= 0 ? raw.slice(at + sep.length) : '';
  if (/FAIL/i.test(valueOf(headers, 'x-ses-spam-verdict')) || /FAIL/i.test(valueOf(headers, 'x-ses-virus-verdict'))) return null;
  const original = valueOf(headers, 'reply-to') || valueOf(headers, 'from');
  const kept = headers.filter((h) => h.name && !DROP.has(h.name)).map((h) => h.raw);
  return [`From: Sepárame · soporte <${from}>`, ...(original ? [`Reply-To: ${original}`] : []), ...kept].join('\r\n') + '\r\n\r\n' + body;
}

export const handler = async (event: S3Event): Promise<void> => {
  if (!FROM || !FORWARD_TO) throw new Error('MAIL_FROM / FORWARD_TO not configured');
  for (const record of event.Records) {
    const Bucket = record.s3.bucket.name;
    const Key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    const raw = await (await s3.send(new GetObjectCommand({ Bucket, Key }))).Body!.transformToString('utf-8');
    const message = rewrite(raw, FROM);
    if (!message) {
      log.warn('inbound mail dropped (spam or virus verdict)', { key: Key });
      continue;
    }
    await ses.send(new SendEmailCommand({
      FromEmailAddress: FROM,
      Destination: { ToAddresses: [FORWARD_TO] },
      Content: { Raw: { Data: Buffer.from(message, 'utf-8') } },
      ...(CONFIG_SET ? { ConfigurationSetName: CONFIG_SET } : {}),
    }));
    log.info('inbound mail forwarded', { key: Key });
  }
};
