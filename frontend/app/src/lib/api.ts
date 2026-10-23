/**
 * HTTP client for the Sepárame API: adds the Cognito ID token, refreshes once
 * on 401 (then signs out) and turns `{ error: { code, message } }` bodies into
 * `ApiError`s. Mock mode swaps the transport for the in-memory API.
 */
import { ACTING_PRO_HEADER, type ApiErrorBody, type ErrorCode } from '@shared/api';
import { defaultActingHeader } from './actingPro';
import { auth } from './auth';
import { getConfig } from './config';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode | 'network',
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface TransportRequest {
  method: HttpMethod;
  path: string;
  body?: unknown;
  token: string | null;
  /** Extra headers (team plan: `ACTING_PRO_HEADER`). */
  headers?: Record<string, string>;
}

/** Per-call options. */
export interface RequestOptions {
  /**
   * Team plan: the member to act on (`ACTING_PRO_HEADER`); `null` = the owner (no header).
   * Omitted = the professional picked in the selector (lib/actingPro.ts).
   */
  actingProId?: string | null;
}

export interface TransportResponse {
  status: number;
  body: unknown;
}

export type Transport = (req: TransportRequest) => Promise<TransportResponse>;

function parseJson(text: string): unknown {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

const fetchTransport: Transport = async ({ method, path, body, token, headers }) => {
  const res = await fetch(`${getConfig().apiUrl}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: parseJson(text) };
};

let transport: Transport = fetchTransport;

export function setTransport(next: Transport): void {
  transport = next;
}

function toError(status: number, body: unknown): ApiError {
  const err = (body as Partial<ApiErrorBody> | null)?.error;
  if (err?.code) return new ApiError(status, err.code, err.message ?? '', err.fields);
  const code: ErrorCode = status === 401 ? 'unauthorized' : status === 403 ? 'forbidden' : status === 404 ? 'not_found' : 'internal';
  return new ApiError(status, code, '');
}

function actingHeaders(options: RequestOptions | undefined): Record<string, string> | undefined {
  const acting = options?.actingProId !== undefined ? options.actingProId : defaultActingHeader();
  return acting ? { [ACTING_PRO_HEADER]: acting } : undefined;
}

async function send(method: HttpMethod, path: string, body: unknown, headers: Record<string, string> | undefined): Promise<TransportResponse> {
  try {
    return await transport({ method, path, body, token: await auth.getIdToken(), ...(headers ? { headers } : {}) });
  } catch {
    throw new ApiError(0, 'network', '');
  }
}

export async function request<T>(method: HttpMethod, path: string, body?: unknown, options?: RequestOptions): Promise<T> {
  const headers = actingHeaders(options);
  let res = await send(method, path, body, headers);
  if (res.status === 401) {
    const refreshed = await auth.forceRefresh();
    if (refreshed) res = await send(method, path, body, headers);
    if (res.status === 401) {
      void auth.signOut();
      throw toError(401, res.body);
    }
  }
  if (res.status >= 400) throw toError(res.status, res.body);
  return res.body as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) => request<T>('POST', path, body ?? {}, options),
  put: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>('PUT', path, body, options),
  patch: <T>(path: string, body: unknown, options?: RequestOptions) => request<T>('PATCH', path, body, options),
  del: <T>(path: string, options?: RequestOptions) => request<T>('DELETE', path, undefined, options),
};

/** User-facing Spanish message for any error thrown by the API layer. */
export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Algo salió mal. Inténtalo de nuevo.';
  switch (error.code) {
    case 'network':
      return 'No hay conexión. Revisa tu internet e inténtalo de nuevo.';
    case 'slot_taken':
      return 'Ese horario se acaba de ocupar. Elige otro.';
    case 'slug_taken':
      return 'Ese enlace ya lo tiene otra persona. Prueba otro.';
    case 'read_only':
      return 'Tu plan venció: el panel está en solo lectura hasta que renueves.';
    case 'rate_limited':
      return 'Vas muy rápido. Espera un momento e inténtalo de nuevo.';
    case 'conflict':
      return 'Alguien cambió esto al mismo tiempo. Recarga e inténtalo de nuevo.';
    case 'forbidden':
      return 'No tienes permiso para hacer esto.';
    case 'not_found':
      return 'No encontramos lo que buscas.';
    case 'unauthorized':
      return 'Tu sesión terminó. Vuelve a entrar.';
    case 'validation':
      return error.message || 'Revisa los datos e inténtalo de nuevo.';
    default:
      return error.message || 'Algo salió mal. Inténtalo de nuevo.';
  }
}
