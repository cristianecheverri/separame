/**
 * Team plan: which professional the panel acts on (docs/team-plan.md).
 *
 * The owner picks «Todos» or one member of `me.team`; the choice is kept per tab
 * (sessionStorage) and falls back to the owner when the stored id is no longer
 * in the team. Queries of the acting-scoped resources (appointments, slots,
 * services, availability, clients, waitlist, stats) put the acting proId in their
 * key and send it in `ACTING_PRO_HEADER` (nothing for the owner), so switching
 * never shows another professional's cached data. `<ActingScope>` overrides the
 * acting professional for a subtree (e.g. «Nueva cita» for a member under «Todos»).
 */
import { createContext, createElement, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { MeResponse, TeamMemberView } from '@shared/api';
import { session } from './storage';

export const ALL_PROS = 'all';
/** «Todos» or a member's proId (the owner included). */
export type ActingSelection = typeof ALL_PROS | string;

const STORAGE_KEY = 'separame:acting-pro';
const listeners = new Set<() => void>();
let stored: string | null = session.get(STORAGE_KEY);
/** Owner and member ids of the signed-in account (kept in sync by `useActing`). */
let account: { ownerId: string | null; memberIds: string[] } = { ownerId: null, memberIds: [] };

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Picks «Todos» or a professional; remembered for this tab. */
export function setActingSelection(next: ActingSelection): void {
  if (next === stored) return;
  stored = next;
  session.set(STORAGE_KEY, next);
  listeners.forEach((l) => l());
}

/** Forgets the choice (sign out, tests). */
export function resetActingSelection(): void {
  stored = null;
  session.remove(STORAGE_KEY);
  account = { ownerId: null, memberIds: [] };
  listeners.forEach((l) => l());
}

/**
 * The selection that applies: the stored one while it is still valid, else the owner.
 * «Todos» needs a team with at least two professionals.
 */
export function resolveSelection(raw: string | null, ownerId: string, memberIds: string[]): ActingSelection {
  if (raw === ALL_PROS) return memberIds.length > 1 ? ALL_PROS : ownerId;
  return raw && memberIds.includes(raw) ? raw : ownerId;
}

/** Header value for acting on `proId`: nothing for the owner (the API's default). */
export function actingHeaderFor(proId: string | null | undefined, ownerId: string | null | undefined): string | null {
  return proId && proId !== ownerId ? proId : null;
}

/** Default header of the API client: the selected member (nothing for the owner or «Todos»). */
export function defaultActingHeader(): string | null {
  const { ownerId, memberIds } = account;
  if (!ownerId) return null;
  const selection = resolveSelection(stored, ownerId, memberIds);
  return selection === ALL_PROS ? null : actingHeaderFor(selection, ownerId);
}

const ScopeContext = createContext<string | null>(null);

/** Acts on `proId` inside this subtree, whatever the selector says. */
export function ActingScope({ proId, children }: { proId: string; children: ReactNode }) {
  return createElement(ScopeContext.Provider, { value: proId }, children);
}

export interface Acting {
  /** The account owner's proId ('' before /me loads a profile). */
  ownerId: string;
  /** Effective selection (validated against the team). */
  selection: ActingSelection;
  /** «Todos» is selected and no scope overrides it (merged views). */
  isAll: boolean;
  /** The professional single-pro screens and hooks act on («Todos» → the owner). */
  proId: string;
  /** `ACTING_PRO_HEADER` value for `proId` (null = owner). */
  header: string | null;
  /** Owner first; empty without a team. */
  members: TeamMemberView[];
}

/** Pure: what `useActing` returns for a given /me, stored choice and scope. */
export function actingFrom(me: MeResponse | undefined, raw: string | null, scope: string | null): Acting {
  const ownerId = me?.profile?.id ?? '';
  const members = me?.team?.members ?? [];
  const memberIds = members.map((m) => m.proId);
  const selection = ownerId ? resolveSelection(raw, ownerId, memberIds) : ownerId;
  const proId = scope ?? (selection === ALL_PROS ? ownerId : selection);
  return { ownerId, selection, isAll: !scope && selection === ALL_PROS, proId, header: actingHeaderFor(proId, ownerId), members };
}

/** Keeps the API client's default header in line with the account loaded in /me. */
export function syncActingAccount(me: MeResponse | undefined): void {
  const ownerId = me?.profile?.id ?? null;
  const memberIds = me?.team?.members.map((m) => m.proId) ?? [];
  if (account.ownerId === ownerId && account.memberIds.join() === memberIds.join()) return;
  account = { ownerId, memberIds };
}

/** Reads the acting professional; `me` comes from the /me query (see `useActing` in queries.ts). */
export function useActingFrom(me: MeResponse | undefined): Acting {
  const raw = useSyncExternalStore(subscribe, () => stored, () => stored);
  const scope = useContext(ScopeContext);
  syncActingAccount(me);
  return actingFrom(me, raw, scope);
}
