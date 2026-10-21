import { env } from './env';

/**
 * Structured JSON logs (one line per entry) so CloudWatch Logs Insights can
 * filter by field. Never log PII beyond ids: no client names, emails or
 * phones — pass `proId` / `appointmentId` instead. Debug is silent in prod.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';
type Fields = Record<string, unknown>;

function serializeError(err: unknown): Fields {
  if (err instanceof Error) return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  return { error: String(err) };
}

function write(level: Level, msg: string, fields: Fields = {}): void {
  if (level === 'debug' && env.isProd()) return;
  const { err, ...rest } = fields;
  const entry = { level, msg, ...rest, ...(err !== undefined ? serializeError(err) : {}) };
  const line = JSON.stringify(entry);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  debug: (msg: string, fields?: Fields) => write('debug', msg, fields),
  info: (msg: string, fields?: Fields) => write('info', msg, fields),
  warn: (msg: string, fields?: Fields) => write('warn', msg, fields),
  error: (msg: string, fields?: Fields) => write('error', msg, fields),
};
