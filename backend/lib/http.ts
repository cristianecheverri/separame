import type {
  APIGatewayProxyEventV2, APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyStructuredResultV2,
} from 'aws-lambda';
import type { z } from 'zod';
import { ERROR_STATUS, type ApiErrorBody, type ErrorCode } from '../../shared/api';
import { log } from './logger';

/**
 * HTTP API (payload v2) helpers: JSON responses, the `ApiError` → error body
 * mapping, zod-validated body/query parsing and the `routeKey` dispatcher every
 * API Lambda is built with. Errors always leave as
 * `{ error: { code, message, fields? } }` with the status from `ERROR_STATUS` (shared/api.ts).
 */

/** Both public (no authorizer) and JWT-protected events flow through the same helpers. */
export type ApiEvent = APIGatewayProxyEventV2 | APIGatewayProxyEventV2WithJWTAuthorizer;
export type ApiResult = APIGatewayProxyStructuredResultV2;
export type RouteHandler = (event: ApiEvent) => Promise<ApiResult>;

/** Default user-facing messages (Spanish, tuteo); callers may override. */
const DEFAULT_MESSAGES: Record<ErrorCode, string> = {
  validation: 'Revisa los datos marcados.',
  unauthorized: 'Tu sesión venció. Vuelve a entrar.',
  forbidden: 'No tienes permiso para hacer esto.',
  not_found: 'No encontramos lo que buscas.',
  slot_taken: 'Alguien acaba de separar esa hora. Elige otra.',
  slug_taken: 'Ese enlace ya lo tiene otra persona. Prueba otro.',
  conflict: 'Algo cambió mientras tanto. Recarga e intenta de nuevo.',
  agenda_unavailable: 'Agenda no disponible temporalmente.',
  read_only: 'Tu plan venció: el panel está en solo lectura. Renueva para volver a administrar tu agenda.',
  needs_onboarding: 'Termina de crear tu perfil para continuar.',
  too_late: 'Ya no se puede cambiar esta cita: faltan menos de 2 horas.',
  captcha_failed: 'No pudimos verificar que eres una persona. Intenta de nuevo.',
  rate_limited: 'Hiciste demasiados intentos. Espera unos minutos e intenta de nuevo.',
  internal: 'Algo salió mal. Intenta de nuevo en un momento.',
};

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly fields?: Record<string, string>;

  constructor(code: ErrorCode, message?: string, fields?: Record<string, string>) {
    super(message ?? DEFAULT_MESSAGES[code]);
    this.name = 'ApiError';
    this.code = code;
    this.fields = fields;
  }

  get status(): number {
    return ERROR_STATUS[this.code];
  }
}

const BASE_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
};

export function json(status: number, body: unknown): ApiResult {
  return { statusCode: status, headers: BASE_HEADERS, body: JSON.stringify(body) };
}

export const ok = (body: unknown): ApiResult => json(200, body);
export const created = (body: unknown): ApiResult => json(201, body);
export const noContent = (): ApiResult => ({ statusCode: 204, headers: { 'cache-control': 'no-store' } });

export function errorResponse(err: ApiError): ApiResult {
  const body: ApiErrorBody = {
    error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
  };
  return json(err.status, body);
}

/** Field path → first message, e.g. `{ "client.email": "Correo inválido" }`. Root issues go under `_`. */
export function zodFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_';
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function validationError(fields: Record<string, string>, message?: string): ApiError {
  return new ApiError('validation', message, fields);
}

/** Validates any value against a schema, throwing a `validation` ApiError with per-field messages. */
export function validate<S extends z.ZodType>(schema: S, value: unknown): z.output<S> {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(zodFields(result.error));
  return result.data;
}

function rawBody(event: ApiEvent): string {
  if (!event.body) return '';
  return event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body;
}

export function parseBody<S extends z.ZodType>(event: ApiEvent, schema: S): z.output<S> {
  const text = rawBody(event);
  let value: unknown = {};
  if (text.trim()) {
    try {
      value = JSON.parse(text);
    } catch {
      throw validationError({ _: 'El cuerpo de la solicitud no es JSON válido' });
    }
  }
  return validate(schema, value);
}

export function parseQuery<S extends z.ZodType>(event: ApiEvent, schema: S): z.output<S> {
  return validate(schema, event.queryStringParameters ?? {});
}

/** Raw body text (webhooks verify signatures on the exact payload). */
export const bodyText = rawBody;

export function pathParam(event: ApiEvent, name: string): string {
  const value = event.pathParameters?.[name];
  if (!value) throw new ApiError('not_found');
  return decodeURIComponent(value);
}

export const sourceIp = (event: ApiEvent): string => event.requestContext?.http?.sourceIp ?? 'unknown';

/**
 * Builds the Lambda handler for a route group: dispatches on `event.routeKey`
 * (e.g. `"GET /me/services"`), turns `ApiError` into its JSON error and any
 * other exception into a logged 500 that never leaks internals.
 */
export function createApiHandler(routes: Record<string, RouteHandler>) {
  return async (event: ApiEvent): Promise<ApiResult> => {
    const route = routes[event.routeKey];
    try {
      if (!route) throw new ApiError('not_found', 'Ruta no encontrada.');
      return await route(event);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status >= 500) log.error('api error', { routeKey: event.routeKey, code: err.code, err });
        return errorResponse(err);
      }
      log.error('unhandled error', { routeKey: event.routeKey, err });
      return errorResponse(new ApiError('internal'));
    }
  };
}
