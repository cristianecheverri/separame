import { createBookingSchema, holdSlotSchema } from '../../../shared/schemas';
import { ApiError, created, createApiHandler, ok, parseBody, pathParam, sourceIp, type ApiEvent } from '../../lib/http';
import { hitRateLimit, RATE_RULES } from '../../lib/rate-limit';
import { verifyTurnstile } from '../../lib/turnstile';
import { createAppointment, createBookingResponse } from '../../services/appointments';
import { placeHold } from '../../services/holds';
import { proIdBySlug, requireProfile } from '../../services/profiles';
import { requireService } from '../../services/services';
import { assertBookable, loadSubscription } from '../../services/subscriptions';

/**
 * Client books from the public page: zod → rate limits → Turnstile →
 * subscription gate → slot check on fresh data → one transaction
 * (appointment + locks [+ idempotency marker] [− the page's hold]). A retry
 * with the same `idempotencyKey` returns the appointment it already created.
 * Emails go out from the DynamoDB stream.
 *
 * Holds: the page holds the hour the client picks (services/holds.ts) —
 * rate limit → subscription gate → slot check → hold item + lock units.
 */

async function bookableProId(event: ApiEvent, now: Date): Promise<string> {
  const proId = await proIdBySlug(pathParam(event, 'slug').toLowerCase());
  if (!proId) throw new ApiError('not_found', 'No encontramos esta agenda.');
  const { status } = await loadSubscription(proId, now);
  assertBookable(status);
  return proId;
}

export const handler = createApiHandler({
  'POST /public/pros/{slug}/holds': async (event) => {
    const input = parseBody(event, holdSlotSchema);
    await hitRateLimit(RATE_RULES.holdPerIp, sourceIp(event));
    const now = new Date();
    const proId = await bookableProId(event, now);
    const service = await requireService(proId, input.serviceId, { visibleOnly: true });
    return ok(await placeHold({ proId, service, start: input.start, holdId: input.holdId, now }));
  },

  'POST /public/pros/{slug}/bookings': async (event) => {
    const input = parseBody(event, createBookingSchema);
    const ip = sourceIp(event);
    await hitRateLimit(RATE_RULES.bookingPerIp, ip);
    await hitRateLimit(RATE_RULES.bookingPerPhone, input.client.phone);
    if (input.client.email) await hitRateLimit(RATE_RULES.bookingPerEmail, input.client.email);
    if (!(await verifyTurnstile(input.turnstileToken, ip))) throw new ApiError('captcha_failed');

    const now = new Date();
    const proId = await bookableProId(event, now);

    const service = await requireService(proId, input.serviceId, { visibleOnly: true });
    const appt = await createAppointment({
      proId, service, start: input.start, client: input.client, createdBy: 'client', now, idempotencyKey: input.idempotencyKey,
      holdId: input.holdId,
    });
    const pro = await requireProfile(proId);
    return created(await createBookingResponse(appt, pro));
  },
});
