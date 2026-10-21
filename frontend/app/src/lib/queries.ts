/** react-query hooks for every API resource the panel reads. */
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import {
  apiPaths,
  type AdminProDetailResponse, type AdminStatsResponse, type AppointmentsResponse, type AvailabilitySettingsResponse,
  type BillingResponse, type ListPricesResponse, type ListSubscriptionsQuery, type ListSubscriptionsResponse,
  type MeResponse, type MigrationsResponse, type ProSlotsResponse, type ServicesResponse,
} from '@shared/api';
import type { ISODate } from '@shared/time';
import type { Appointment } from '@shared/types';
import { api } from './api';

export const keys = {
  me: ['me'] as const,
  services: ['services'] as const,
  availability: ['availability'] as const,
  appointmentsAll: ['appointments'] as const,
  appointments: (from: ISODate, to: ISODate) => ['appointments', from, to] as const,
  slotsAll: ['slots'] as const,
  slots: (serviceId: string, from: ISODate, days: number) => ['slots', serviceId, from, days] as const,
  billing: ['billing'] as const,
  adminStats: ['admin', 'stats'] as const,
  adminSubscriptions: (q: ListSubscriptionsQuery) => ['admin', 'subscriptions', q.state ?? '', q.q ?? ''] as const,
  adminSubscriptionsAll: ['admin', 'subscriptions'] as const,
  adminPro: (id: string) => ['admin', 'pro', id] as const,
  adminPrices: ['admin', 'prices'] as const,
  adminMigrations: ['admin', 'migrations'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: () => api.get<MeResponse>(apiPaths.me()), staleTime: 60_000 });

export function useServices(enabled = true) {
  return useQuery({ queryKey: keys.services, queryFn: () => api.get<ServicesResponse>(apiPaths.services()), enabled });
}

export function useAvailability(enabled = true) {
  return useQuery({ queryKey: keys.availability, queryFn: () => api.get<AvailabilitySettingsResponse>(apiPaths.availability()), enabled });
}

/** Appointments in a Bogotá date range; refreshed every 2 minutes while the panel is open. */
export function useAppointments(from: ISODate, to: ISODate, enabled = true) {
  return useQuery({
    queryKey: keys.appointments(from, to),
    queryFn: () => api.get<AppointmentsResponse>(apiPaths.appointments({ from, to })),
    enabled,
    refetchInterval: 120_000,
    placeholderData: keepPreviousData,
  });
}

export function useSlots(serviceId: string | null, from: ISODate, days: number) {
  return useQuery({
    queryKey: keys.slots(serviceId ?? '', from, days),
    queryFn: () => api.get<ProSlotsResponse>(apiPaths.slots({ serviceId: serviceId!, from, days })),
    enabled: !!serviceId,
    staleTime: 15_000,
  });
}

export function useBilling(enabled = true) {
  return useQuery({ queryKey: keys.billing, queryFn: () => api.get<BillingResponse>(apiPaths.billing()), enabled, staleTime: 60_000 });
}

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

export const useInvalidate = () => {
  const qc = useQueryClient();
  return (key: readonly unknown[]) => qc.invalidateQueries({ queryKey: key });
};

// ── Optimistic helpers for appointment lists ────────────────────────────────

type Snapshot = [readonly unknown[], AppointmentsResponse | undefined][];

/** Applies `update` to every cached appointments list; returns a snapshot for rollback. */
export async function patchAppointmentLists(
  qc: QueryClient,
  update: (list: Appointment[], range: { from: ISODate; to: ISODate }) => Appointment[],
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: keys.appointmentsAll });
  const snapshot = qc.getQueriesData<AppointmentsResponse>({ queryKey: keys.appointmentsAll }) as Snapshot;
  for (const [key, data] of snapshot) {
    if (!data) continue;
    const [, from, to] = key as [string, ISODate, ISODate];
    qc.setQueryData<AppointmentsResponse>(key, { appointments: update(data.appointments, { from, to }) });
  }
  return snapshot;
}

export function restoreSnapshot(qc: QueryClient, snapshot: Snapshot | undefined): void {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data));
}
