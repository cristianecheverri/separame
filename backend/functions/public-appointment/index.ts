import { cancelBookingSchema, rescheduleBookingSchema } from '../../../shared/schemas';
import { ApiError, createApiHandler, ok, parseBody, pathParam, sourceIp } from '../../lib/http';
import { hitRateLimit, RATE_RULES } from '../../lib/rate-limit';
import {
  bookingSummary, cancelAppointment, canClientChange, confirmAttendance, managedResponse, moveAppointment, resolveManageToken,
  toAppointment,
} from '../../services/appointments';
import { requireProfile } from '../../services/profiles';
import { assertBookable, loadSubscription } from '../../services/subscriptions';

/**
 * Client manages an appointment through the signed link `/c/<token>` (no
 * account). Changes close CLIENT_CHANGE_CUTOFF_MIN before the start. Cancel
 * works even if the professional's plan expired; reschedule needs an active
 * agenda (it is a new booking). "Sí, voy" (confirm attendance) works until
 * the start, also with an expired plan.
 */
export const handler = createApiHandler({
  'GET /public/appointments/{token}': async (event) => {
    const now = new Date();
    const appt = await resolveManageToken(pathParam(event, 'token'), now);
    const pro = await requireProfile(appt.proId);
    return ok(managedResponse(toAppointment(appt), pro, now));
  },

  'POST /public/appointments/{token}/cancel': async (event) => {
    await hitRateLimit(RATE_RULES.managePerIp, sourceIp(event));
    const input = parseBody(event, cancelBookingSchema);
    const now = new Date();
    const appt = await resolveManageToken(pathParam(event, 'token'), now);
    const pro = await requireProfile(appt.proId);
    if (appt.status === 'cancelled') return ok({ booking: bookingSummary(toAppointment(appt), pro) });
    if (!canClientChange(appt, now)) throw new ApiError('too_late');
    const cancelled = await cancelAppointment({ appt, actor: 'client', reason: input.reason, now });
    return ok({ booking: bookingSummary(toAppointment(cancelled), pro) });
  },

  'POST /public/appointments/{token}/confirm': async (event) => {
    await hitRateLimit(RATE_RULES.managePerIp, sourceIp(event));
    const now = new Date();
    const appt = await resolveManageToken(pathParam(event, 'token'), now);
    const confirmed = await confirmAttendance(appt, now);
    const pro = await requireProfile(appt.proId);
    return ok({ booking: bookingSummary(toAppointment(confirmed), pro) });
  },

  'POST /public/appointments/{token}/reschedule': async (event) => {
    await hitRateLimit(RATE_RULES.managePerIp, sourceIp(event));
    const input = parseBody(event, rescheduleBookingSchema);
    const now = new Date();
    const appt = await resolveManageToken(pathParam(event, 'token'), now);
    if (appt.status !== 'confirmed') throw new ApiError('conflict', 'Esta cita ya fue cancelada.');
    if (!canClientChange(appt, now)) throw new ApiError('too_late');
    const { status } = await loadSubscription(appt.proId, now);
    assertBookable(status);
    const moved = await moveAppointment({ appt, start: input.start, actor: 'client', now });
    const pro = await requireProfile(appt.proId);
    return ok({ booking: bookingSummary(toAppointment(moved), pro) });
  },
});
