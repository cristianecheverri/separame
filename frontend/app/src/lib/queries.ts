/** react-query hooks for every API resource the panel reads. */
import { keepPreviousData, useQueries, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  apiPaths,
  type AdminFeedbackResponse, type AdminProDetailResponse, type AdminTeamsResponse, type AdminStatsResponse, type AppointmentsResponse, type AvailabilitySettingsResponse, type CalendarSyncResponse,
  type BillingResponse, type ClientDetailResponse, type ClientsResponse, type ListPricesResponse, type PushConfigResponse, type StatsResponse, type WaitlistResponse, type ListSubscriptionsQuery, type ListSubscriptionsResponse,
  type MeResponse, type MigrationsResponse, type ProSlotsResponse, type ServicesResponse,
} from '@shared/api';
import type { ISODate } from '@shared/time';
import type { Appointment } from '@shared/types';
import { actingHeaderFor, useActingFrom, type Acting } from './actingPro';
import { api } from './api';

/**
 * Acting-scoped resources (team plan) end their key with the acting proId, so each
 * professional has its own cache entry; the first elements stay as before, so
 * `servicesAll`, `appointmentsAll`… still invalidate every professional at once.
 */
export const keys = {
  me: ['me'] as const,
  servicesAll: ['services'] as const,
  services: (proId: string) => ['services', proId] as const,
  availabilityAll: ['availability'] as const,
  availability: (proId: string) => ['availability', proId] as const,
  appointmentsAll: ['appointments'] as const,
  appointments: (from: ISODate, to: ISODate, proId: string) => ['appointments', from, to, proId] as const,
  slotsAll: ['slots'] as const,
  slots: (serviceId: string, from: ISODate, days: number, proId: string, excludeAppointmentId = '') =>
    ['slots', serviceId, from, days, excludeAppointmentId, proId] as const,
  billing: ['billing'] as const,
  calendarSync: ['calendar-sync'] as const,
  clientsAll: ['clients'] as const,
  clients: (q: string, proId: string) => ['clients', 'list', q, proId] as const,
  client: (key: string, proId: string) => ['clients', 'detail', key, proId] as const,
  waitlistAll: ['waitlist'] as const,
  waitlist: (proId: string) => ['waitlist', proId] as const,
  statsAll: ['stats'] as const,
  stats: (from: ISODate, to: ISODate, proId: string, scope?: 'value') => ['stats', from, to, proId, scope ?? 'all'] as const,
  pushConfig: ['push-config'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminSubscriptions: (q: ListSubscriptionsQuery) => ['admin', 'subscriptions', q.state ?? '', q.q ?? ''] as const,
  adminSubscriptionsAll: ['admin', 'subscriptions'] as const,
  adminPro: (id: string) => ['admin', 'pro', id] as const,
  adminPrices: ['admin', 'prices'] as const,
  adminMigrations: ['admin', 'migrations'] as const,
  adminTeams: ['admin', 'teams'] as const,
  adminFeedback: ['admin', 'feedback'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<MeResponse>(apiPaths.me()), staleTime: 60_000 });

/** The professional the panel acts on (team plan; the owner without a team). */
export function useActing(): Acting {
  return useActingFrom(useMe().data);
}

/** Like `keepPreviousData`, but never across professionals: switching shows a skeleton, not someone else's data. */
const keepPreviousOf =
  (proId: string) =>
  <T,>(previous: T | undefined, query: { queryKey: readonly unknown[] } | undefined): T | undefined =>
    query && query.queryKey[query.queryKey.length - 1] === proId ? previous : undefined;

export function useServices(enabled = true) {
  const { proId, header } = useActing();
  return useQuery({ queryKey: keys.services(proId), queryFn: () => api.get<ServicesResponse>(apiPaths.services(), { actingProId: header }), enabled });
}

export function useAvailability(enabled = true) {
  const { proId, header } = useActing();
  return useQuery({ queryKey: keys.availability(proId), queryFn: () => api.get<AvailabilitySettingsResponse>(apiPaths.availability(), { actingProId: header }), enabled });
}

const appointmentsQuery = (from: ISODate, to: ISODate, proId: string, header: string | null, enabled: boolean) => ({
  queryKey: keys.appointments(from, to, proId),
  queryFn: () => api.get<AppointmentsResponse>(apiPaths.appointments({ from, to }), { actingProId: header }),
  enabled,
  refetchInterval: 120_000,
  placeholderData: keepPreviousOf(proId),
});

/** Appointments in a Bogotá date range of the acting professional; refreshed every 2 minutes while the panel is open. */
export function useAppointments(from: ISODate, to: ISODate, enabled = true) {
  const { proId, header } = useActing();
  return useQuery(appointmentsQuery(from, to, proId, header, enabled));
}

export interface MergedResult<T> {
  data: T | undefined;
  isPending: boolean;
  isError: boolean;
}

/**
 * Team plan, «Todos»: the appointments of every professional of the team, merged and
 * sorted (each one keeps its `proId`); the acting professional's otherwise.
 */
export function useAgendaAppointments(from: ISODate, to: ISODate, enabled = true): MergedResult<AppointmentsResponse> {
  const acting = useActing();
  const single = useQuery(appointmentsQuery(from, to, acting.proId, acting.header, enabled && !acting.isAll));
  const merged = useQueries({
    queries: (acting.isAll ? acting.members : []).map((m) => appointmentsQuery(from, to, m.proId, actingHeaderFor(m.proId, acting.ownerId), enabled)),
    combine: (results) => ({
      data: results.length && results.every((r) => r.data)
        ? { appointments: results.flatMap((r) => r.data!.appointments).sort((a, b) => a.start.localeCompare(b.start)) }
        : undefined,
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
    }),
  });
  return acting.isAll ? merged : { data: single.data, isPending: single.isPending, isError: single.isError };
}

/** Team plan, «Equipo»: services and schedule of every professional (for each card's summary). */
export function useTeamMemberSettings(members: { proId: string }[]) {
  const { ownerId } = useActing();
  return useQueries({
    queries: members.flatMap((m) => {
      const acting = { actingProId: actingHeaderFor(m.proId, ownerId) };
      return [
        { queryKey: keys.services(m.proId), queryFn: () => api.get<ServicesResponse>(apiPaths.services(), acting) },
        { queryKey: keys.availability(m.proId), queryFn: () => api.get<AvailabilitySettingsResponse>(apiPaths.availability(), acting) },
      ];
    }),
    combine: (results) =>
      new Map(
        members.map((m, i) => [
          m.proId,
          { services: (results[i * 2]?.data as ServicesResponse | undefined)?.services, settings: (results[i * 2 + 1]?.data as AvailabilitySettingsResponse | undefined)?.settings },
        ]),
      ),
  });
}

export function useSlots(serviceId: string | null, from: ISODate, days: number, excludeAppointmentId?: string) {
  const { proId, header } = useActing();
  return useQuery({
    queryKey: keys.slots(serviceId ?? '', from, days, proId, excludeAppointmentId),
    queryFn: () => api.get<ProSlotsResponse>(apiPaths.slots({ serviceId: serviceId!, from, days, excludeAppointmentId }), { actingProId: header }),
    enabled: !!serviceId,
    staleTime: 15_000,
  });
}

export function useBilling(enabled = true) {
  return useQuery({ queryKey: keys.billing, queryFn: () => api.get<BillingResponse>(apiPaths.billing(), { actingProId: null }), enabled, staleTime: 60_000 });
}

export function useClients(q: string) {
  const { proId, header } = useActing();
  return useQuery({
    queryKey: keys.clients(q, proId),
    queryFn: () => api.get<ClientsResponse>(apiPaths.clients(q ? { q } : undefined), { actingProId: header }),
    placeholderData: keepPreviousOf(proId),
  });
}

export function useClient(key: string) {
  const { proId, header } = useActing();
  return useQuery({ queryKey: keys.client(key, proId), queryFn: () => api.get<ClientDetailResponse>(apiPaths.client(key), { actingProId: header }) });
}

const waitlistQuery = (proId: string, header: string | null) => ({
  queryKey: keys.waitlist(proId),
  queryFn: () => api.get<WaitlistResponse>(apiPaths.waitlist(), { actingProId: header }),
});

/** Waitlist of the acting professional, or of the whole team under «Todos». */
export function useWaitlist(): MergedResult<WaitlistResponse> {
  const acting = useActing();
  const single = useQuery({ ...waitlistQuery(acting.proId, acting.header), enabled: !acting.isAll });
  const merged = useQueries({
    queries: (acting.isAll ? acting.members : []).map((m) => waitlistQuery(m.proId, actingHeaderFor(m.proId, acting.ownerId))),
    combine: (results) => ({
      data: results.length && results.every((r) => r.data)
        ? { entries: results.flatMap((r) => r.data!.entries).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }
        : undefined,
      isPending: results.some((r) => r.isPending),
      isError: results.some((r) => r.isError),
    }),
  });
  return acting.isAll ? merged : { data: single.data, isPending: single.isPending, isError: single.isError };
}

/** `scope: 'value'`: the agenda card's light version (no client records read). */
export function useStats(from: ISODate, to: ISODate, scope?: 'value') {
  const { proId, header } = useActing();
  return useQuery({
    queryKey: keys.stats(from, to, proId, scope),
    queryFn: () => api.get<StatsResponse>(apiPaths.stats({ from, to, scope }), { actingProId: header }),
    placeholderData: keepPreviousOf(proId),
    // Opening the agenda again within a few minutes doesn't ask again.
    staleTime: 5 * 60_000,
  });
}

export const usePushConfig = () => useQuery({ queryKey: keys.pushConfig, queryFn: () => api.get<PushConfigResponse>(apiPaths.pushConfig()), staleTime: 5 * 60_000 });

export const useCalendarSync = () =>
  useQuery({ queryKey: keys.calendarSync, queryFn: () => api.get<CalendarSyncResponse>(apiPaths.calendarSync()), staleTime: 5 * 60_000 });

export const useAdminStats = () => useQuery({ queryKey: keys.adminStats, queryFn: () => api.get<AdminStatsResponse>(apiPaths.adminStats()) });

export function useAdminSubscriptions(q: ListSubscriptionsQuery = {}) {
  return useQuery({
    queryKey: keys.adminSubscriptions(q),
    queryFn: () => api.get<ListSubscriptionsResponse>(apiPaths.adminSubscriptions(q)),
    placeholderData: keepPreviousData,
  });
}

export const useAdminPro = (id: string) =>
  useQuery({ queryKey: keys.adminPro(id), queryFn: () => api.get<AdminProDetailResponse>(apiPaths.adminPro(id)) });

export const useAdminPrices = () => useQuery({ queryKey: keys.adminPrices, queryFn: () => api.get<ListPricesResponse>(apiPaths.adminPrices()) });

export const useAdminMigrations = () =>
  useQuery({ queryKey: keys.adminMigrations, queryFn: () => api.get<MigrationsResponse>(apiPaths.adminMigrations()) });

export const useAdminTeams = () => useQuery({ queryKey: keys.adminTeams, queryFn: () => api.get<AdminTeamsResponse>(apiPaths.adminTeams()) });
export const useAdminFeedback = () => useQuery({ queryKey: keys.adminFeedback, queryFn: () => api.get<AdminFeedbackResponse>(apiPaths.adminFeedback()) });

export const useInvalidate = () => {
  const qc = useQueryClient();
  return (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
};

// ── Optimistic helpers for appointment lists ────────────────────────────────

type Snapshot = [readonly unknown[], AppointmentsResponse | undefined][];

/**
 * Applies `update` to every cached appointments list (only those of `proId` when given);
 * returns a snapshot for rollback.
 */
export async function patchAppointmentLists(
  qc: QueryClient,
  update: (list: Appointment[], range: { from: ISODate; to: ISODate }) => Appointment[],
  proId?: string,
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: keys.appointmentsAll });
  const snapshot = qc.getQueriesData<AppointmentsResponse>({ queryKey: keys.appointmentsAll }) as Snapshot;
  for (const [key, data] of snapshot) {
    const [, from, to, listProId] = key as unknown as [string, ISODate, ISODate, string];
    if (!data || (proId && listProId !== proId)) continue;
    qc.setQueryData<AppointmentsResponse>(key, { appointments: update(data.appointments, { from, to }) });
  }
  return snapshot;
}

export function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined): void {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}
