import type { ApiEvent } from '../lib/http';
import type { Service, ProProfile } from '../../shared/types';
import type { SubItem } from '../services/subscriptions';
import { DEFAULT_RULES, DEFAULT_SCHEDULE } from '../../shared/availability';

/** Test fixtures: environment, API events and canonical items (no AWS calls). */

export function setTestEnv(): void {
  Object.assign(process.env, {
    STAGE: 'dev',
    TABLE_NAME: 'separame-test',
    SITE_URL: 'https://dev.separame.app',
    API_URL: 'https://api.dev.separame.app',
    SITE_BUCKET: 'separame-test-site',
    SITE_DISTRIBUTION_ID: 'E123TEST',
    MAIL_FROM: 'Sepárame <noreply@dev.separame.app>',
    MAIL_CONFIG_SET: 'separame-test',
    SSM_PREFIX: '/separame/dev',
    TURNSTILE_SITE_KEY: '1x00000000000000000000AA',
    ADMIN_EMAIL: 'ops@separame.app',
  });
}

export interface EventInput {
  body?: unknown;
  path?: Record<string, string>;
  query?: Record<string, string>;
  claims?: Record<string, unknown>;
  headers?: Record<string, string>;
  ip?: string;
}

export function apiEvent(routeKey: string, input: EventInput = {}): ApiEvent {
  const [method, rawPath] = routeKey.split(' ');
  return {
    version: '2.0',
    routeKey,
    rawPath,
    rawQueryString: '',
    headers: input.headers ?? {},
    queryStringParameters: input.query,
    pathParameters: input.path,
    body: input.body === undefined ? undefined : typeof input.body === 'string' ? input.body : JSON.stringify(input.body),
    isBase64Encoded: false,
    requestContext: {
      accountId: '1', apiId: 'api', domainName: 'api.test', domainPrefix: 'api', requestId: 'r', routeKey, stage: '$default',
      time: '', timeEpoch: 0,
      http: { method, path: rawPath, protocol: 'HTTP/1.1', sourceIp: input.ip ?? '203.0.113.7', userAgent: 'vitest' },
      ...(input.claims ? { authorizer: { jwt: { claims: input.claims, scopes: [] }, principalId: '', integrationLatency: 0 } } : {}),
    },
  } as unknown as ApiEvent;
}

export const PRO_ID = 'mgx0000proid0001';
export const SUB_ID = 'cognito-sub-1';
export const proClaims = { sub: SUB_ID, email: 'laura@correo.com', 'cognito:groups': '[pros]' };
export const adminClaims = { sub: 'admin-sub', email: 'admin@separame.app', 'cognito:groups': '[admin]' };

export const profile: ProProfile = {
  id: PRO_ID, slug: 'dra-laura-perez', name: 'Dra. Laura Pérez', title: 'Odontóloga', city: 'Medellín', neighborhood: 'El Poblado',
  address: 'Cra. 43A #1-50, consultorio 302', phone: '3001234567', email: 'laura@correo.com',
  createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
};

export const service: Service = {
  id: 'svc1', name: 'Valoración', durationMin: 30, priceCop: 60000, description: '', visible: true, order: 1,
};

export function subItem(overrides: Partial<SubItem> = {}): SubItem {
  return {
    proId: PRO_ID, trialEndsAt: '2026-10-25T00:00:00.000Z', trialStartedAt: '2026-10-18T00:00:00.000Z', paidUntil: null,
    priceVersionId: 'fundador-v1', name: profile.name, slug: profile.slug, title: profile.title, email: profile.email,
    createdAt: '2026-10-18T00:00:00.000Z', updatedAt: '2026-10-18T00:00:00.000Z', ...overrides,
  };
}

/** A pro who chose a 10-minute margin in Disponibilidad (the default is none since 29-oct-2026). */
export const settings = { schedule: DEFAULT_SCHEDULE, rules: { ...DEFAULT_RULES, bufferMin: 10 }, rulesVersion: 2 };

export function canceledTx(codes: string[]): Error {
  return Object.assign(new Error(`Transaction cancelled, please refer cancellation reasons for specific reasons [${codes.join(', ')}]`), {
    name: 'TransactionCanceledException',
    CancellationReasons: codes.map((Code) => ({ Code })),
  });
}

export function conditionalFailure(): Error {
  return Object.assign(new Error('The conditional request failed'), { name: 'ConditionalCheckFailedException' });
}

export const parse = (res: { body?: string }) => JSON.parse(res.body ?? '{}');
