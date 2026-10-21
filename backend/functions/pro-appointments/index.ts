import {
  MAX_APPOINTMENTS_RANGE_DAYS, availabilityQuerySchema, cancelAppointmentSchema, createAppointmentSchema, listAppointmentsQuerySchema,
  moveAppointmentSchema, setOutcomeSchema,
} from '../../../shared/schemas';
import { diffDays } from '../../../shared/time';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, parseQuery, pathParam, validationError } from '../../lib/http';
import {
  cancelAppointment, createAppointment, listAppointments, moveAppointment, requireAppointmentItem, setOutcome, toAppointment,
} from '../../services/appointments';
import { availabilityFor } from '../../services/availability';
import { requireProId } from '../../services/profiles';
import { requireService } from '../../services/services';
import { loadSubscription, requireWritable } from '../../services/subscriptions';

/**
 * The professional's calendar. Same slot rules and lock transactions as the
 * public booking, except the minimum notice (the pro may book a walk-in for
 * right now) and hidden services. Creating/moving needs a non-expired plan.
 * Cancelling is allowed even when the plan expired, so the pro can still
 * warn a client who already has an appointment; so is marking the outcome
 * (attended / no-show), which is record keeping.
 */

export const handler = createApiHandler({
  'GET /me/appointments': async (event) => {
    const query = parseQuery(event, listAppointmentsQuerySchema);
    if (diffDays(query.from, query.to) > MAX_APPOINTMENTS_RANGE_DAYS) throw validationError({ to: `El rango puede ser de máximo ${MAX_APPOINTMENTS_RANGE_DAYS} días` });
    const proId = await requireProId(requirePro(event));
    return ok({ appointments: await listAppointments(proId, query.from, query.to) });
  },

  'POST /me/appointments': async (event) => {
    const input = parseBody(event, createAppointmentSchema);
    const proId = await requireProId(requirePro(event));
    const now = new Date();
    await requireWritable(proId, now);
    const service = await requireService(proId, input.serviceId);
    const appt = await createAppointment({
      proId, service, start: input.start, client: input.client, createdBy: 'pro', now, ignoreMinNotice: true,
    });
    return created({ appointment: toAppointment(appt) });
  },

  'PATCH /me/appointments/{appointmentId}': async (event) => {
    const input = parseBody(event, moveAppointmentSchema);
    const proId = await requireProId(requirePro(event));
    const now = new Date();
    await requireWritable(proId, now);
    const appt = await requireAppointmentItem(proId, pathParam(event, 'appointmentId'));
    const moved = await moveAppointment({ appt, start: input.start, actor: 'pro', now, ignoreMinNotice: true });
    return ok({ appointment: toAppointment(moved) });
  },

  'POST /me/appointments/{appointmentId}/cancel': async (event) => {
    const input = parseBody(event, cancelAppointmentSchema);
    const proId = await requireProId(requirePro(event));
    const appt = await requireAppointmentItem(proId, pathParam(event, 'appointmentId'));
    const cancelled = await cancelAppointment({ appt, actor: 'pro', reason: input.reason, now: new Date() });
    return ok({ appointment: toAppointment(cancelled) });
  },

  'POST /me/appointments/{appointmentId}/outcome': async (event) => {
    const { outcome } = parseBody(event, setOutcomeSchema);
    const proId = await requireProId(requirePro(event));
    const appt = await requireAppointmentItem(proId, pathParam(event, 'appointmentId'));
    return ok({ appointment: toAppointment(await setOutcome(appt, outcome, new Date())) });
  },

  'GET /me/slots': async (event) => {
    const query = parseQuery(event, availabilityQuerySchema);
    const proId = await requireProId(requirePro(event));
    const now = new Date();
    const [service, sub] = await Promise.all([requireService(proId, query.serviceId), loadSubscription(proId, now)]);
    return ok(await availabilityFor({
      proId, service, from: query.from, days: query.days, active: !sub.status.readOnly, now, ignoreMinNotice: true,
    }));
  },
});
