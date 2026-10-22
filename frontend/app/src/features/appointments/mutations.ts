/** Appointment mutations with optimistic updates (rolled back on error). */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPaths, type AppointmentResponse, type CreateAppointmentRequest, type ServicesResponse, type SetOutcomeRequest } from '@shared/api';
import { addMinutes, bogotaDate } from '@shared/time';
import type { Appointment } from '@shared/types';
import { sortByStart } from '../../lib/agenda';
import { track } from '../../lib/analytics';
import { api } from '../../lib/api';
import { now } from '../../lib/clock';
import { keys, patchAppointmentLists, restoreSnapshot } from '../../lib/queries';

type Ctx = { snapshot?: Awaited<ReturnType<typeof patchAppointmentLists>> };

const inRange = (a: Appointment, range: { from: string; to: string }) => {
  const d = bogotaDate(a.start);
  return d >= range.from && d <= range.to;
};

function useSettle() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: keys.appointmentsAll });
    void qc.invalidateQueries({ queryKey: keys.slotsAll });
  };
}

export function useCreateAppointment() {
  const qc = useQueryClient();
  const settle = useSettle();
  return useMutation<AppointmentResponse, Error, CreateAppointmentRequest, Ctx>({
    mutationFn: (req) => api.post<AppointmentResponse>(apiPaths.appointments(), req),
    onMutate: async (req) => {
      const service = qc.getQueryData<ServicesResponse>(keys.services)?.services.find((s) => s.id === req.serviceId);
      if (!service) return {};
      const at = now().toISOString();
      const temp: Appointment = {
        id: `temp-${Date.now()}`, proId: '', serviceId: service.id, serviceName: service.name, durationMin: service.durationMin,
        priceCop: service.priceCop, start: req.start, end: addMinutes(req.start, service.durationMin), status: 'confirmed',
        client: req.client, createdBy: 'pro', createdAt: at, updatedAt: at, clientConfirmation: 'pending', revision: 0, clientKey: '',
      };
      const snapshot = await patchAppointmentLists(qc, (list, range) => (inRange(temp, range) ? sortByStart([...list, temp]) : list));
      return { snapshot };
    },
    onSuccess: () => track('appointment_created', { by: 'pro' }),
    onError: (_e, _v, ctx) => restoreSnapshot(qc, ctx?.snapshot),
    onSettled: settle,
  });
}

export function useMoveAppointment() {
  const qc = useQueryClient();
  const settle = useSettle();
  return useMutation<AppointmentResponse, Error, { appointment: Appointment; start: string }, Ctx>({
    mutationFn: ({ appointment, start }) => api.patch<AppointmentResponse>(apiPaths.appointment(appointment.id), { start }),
    onMutate: async ({ appointment, start }) => {
      const moved: Appointment = { ...appointment, start, end: addMinutes(start, appointment.durationMin) };
      const snapshot = await patchAppointmentLists(qc, (list, range) => {
        const without = list.filter((a) => a.id !== appointment.id);
        return inRange(moved, range) ? sortByStart([...without, moved]) : without;
      });
      return { snapshot };
    },
    onSuccess: () => track('appointment_rescheduled', { by: 'pro' }),
    onError: (_e, _v, ctx) => restoreSnapshot(qc, ctx?.snapshot),
    onSettled: settle,
  });
}

export function useCancelAppointment() {
  const qc = useQueryClient();
  const settle = useSettle();
  return useMutation<AppointmentResponse, Error, { appointment: Appointment; reason?: string }, Ctx>({
    mutationFn: ({ appointment, reason }) => api.post<AppointmentResponse>(apiPaths.cancelAppointment(appointment.id), reason ? { reason } : {}),
    onMutate: async ({ appointment, reason }) => {
      const snapshot = await patchAppointmentLists(qc, (list) =>
        list.map((a) => (a.id === appointment.id ? { ...a, status: 'cancelled', cancelledBy: 'pro', cancelReason: reason } : a)),
      );
      return { snapshot };
    },
    onSuccess: () => track('appointment_cancelled', { by: 'pro' }),
    onError: (_e, _v, ctx) => restoreSnapshot(qc, ctx?.snapshot),
    onSettled: settle,
  });
}

export function useSetOutcome() {
  const qc = useQueryClient();
  return useMutation<AppointmentResponse, Error, { appointment: Appointment; outcome: SetOutcomeRequest['outcome'] }, Ctx>({
    mutationFn: ({ appointment, outcome }) => api.post<AppointmentResponse>(apiPaths.appointmentOutcome(appointment.id), { outcome }),
    onMutate: async ({ appointment, outcome }) => {
      const at = now().toISOString();
      const snapshot = await patchAppointmentLists(qc, (list) =>
        list.map((a) => (a.id === appointment.id ? { ...a, outcome: outcome ?? undefined, outcomeAt: outcome ? at : undefined } : a)),
      );
      return { snapshot };
    },
    onError: (_e, _v, ctx) => restoreSnapshot(qc, ctx?.snapshot),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: keys.appointmentsAll });
      void qc.invalidateQueries({ queryKey: ['clients'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
}
