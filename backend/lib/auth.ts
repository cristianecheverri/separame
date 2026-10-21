import { ADMIN_GROUP } from '../../shared/infra';
import { ApiError, type ApiEvent } from './http';

/**
 * Caller identity from the HTTP API's Cognito JWT authorizer. The frontends
 * send the Cognito **ID token**, so `email` is in the claims. API Gateway
 * flattens claims to strings: `cognito:groups` may arrive as `"[admin pros]"`,
 * `"admin"`, `"admin,pros"` or (in tests / other authorizers) a real array.
 */

export interface AuthUser {
  sub: string;
  email: string;
  groups: string[];
  isAdmin: boolean;
}

type Claims = Record<string, unknown>;

export function parseGroups(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String).map((g) => g.trim()).filter(Boolean);
  if (typeof raw !== 'string') return [];
  let text = raw.trim();
  if (!text) return [];
  if (text.startsWith('[') && text.endsWith(']')) {
    // JSON array (`["admin"]`) or API Gateway's flattened form (`[admin pros]`).
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) return parseGroups(parsed);
    } catch {
      // not JSON — fall through to the bracketed list
    }
    text = text.slice(1, -1);
  }
  return text
    .split(/[\s,]+/)
    .map((g) => g.replace(/^"|"$/g, '').trim())
    .filter(Boolean);
}

function claimsOf(event: ApiEvent): Claims | undefined {
  const ctx = event.requestContext as { authorizer?: { jwt?: { claims?: Claims } } };
  return ctx.authorizer?.jwt?.claims;
}

/** Any signed-in Cognito user (onboarding happens after this). */
export function requireUser(event: ApiEvent): AuthUser {
  const claims = claimsOf(event);
  const sub = typeof claims?.sub === 'string' ? claims.sub : '';
  if (!sub) throw new ApiError('unauthorized');
  const email = typeof claims?.email === 'string' ? claims.email.trim().toLowerCase() : '';
  const groups = parseGroups(claims?.['cognito:groups']);
  return { sub, email, groups, isAdmin: groups.includes(ADMIN_GROUP) };
}

/** Professional routes: a signed-in user (the profile lookup happens in the service). */
export const requirePro = requireUser;

/** Admin routes: the `admin` Cognito group, checked here (the authorizer only proves sign-in). */
export function requireAdmin(event: ApiEvent): AuthUser {
  const user = requireUser(event);
  if (!user.isAdmin) throw new ApiError('forbidden');
  return user;
}
