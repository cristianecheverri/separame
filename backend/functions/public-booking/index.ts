import { createBookingSchema } from '../../../shared/schemas';
import { ApiError, created, createApiHandler, parseBody, pathParam, sourceIp } from '../../lib/http';
import { hitRateLimit, RATE_RULES } from '../../lib/rate-limit';
import { verifyTurnstile } from '../../lib/turnstile';
import { createAppointment, createBookingResponse } from '../../services/appointments';
import { proIdBySlug, requireProfile } from '../../services/profiles';
import { requireService } from '../../services/services';
import { assertBookable, loadSubscription } from '../../services/subscriptions';

/**
 * Client books from the public page: zod → rate limits → Turnstile →
 * subscription gate → slot check on fresh data → one transaction
 * (appointment + locks [+ idempotency marker]). A retry with the same
 * `idempotencyKey` returns the appointment it already created. Emails go out
 * from the DynamoDB stream.
 */
export const handler = createApiHandler({
  'POST /public/pros/{slug}/bookings': async (event) => {
    const input = parseBody(event, createBookingSchema);
    const ip = sourceIp(event);
    await hitRateLimit(RATE_RULES.bookingPerIp, ip);
    await hitRateLimit(RATE_RULES.bookingPerPhone, input.client.phone);
    if (input.client.email) await hitRateLimit(RATE_RULES.bookingPerEmail, input.client.email);
    if (!(await verifyTurnstile(input.turnstileToken, ip))) throw new ApiError('captcha_failed');

    const proId = await proIdBySlug(pathParam(event, 'slug').toLowerCase());
    if (!proId) throw new ApiError('not_found', 'No encontramos esta agenda.');
    const now = new Date();
    const { status } = await loadSubscription(proId, now);
    assertBookable(status);

    const service = await requireService(proId, input.serviceId, { visibleOnly: true });
    const appt = await createAppointment({
      proId, service, start: input.start, client: input.client, createdBy: 'client', now, idempotencyKey: input.idempotencyKey,
    });
    const pro = await requireProfile(proId);
    return created(await createBookingResponse(appt, pro));
  },
});
