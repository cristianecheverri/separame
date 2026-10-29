import { listSubscriptionsQuerySchema, manualPaymentSchema, rejectNoticeSchema, updateFeedbackStatusSchema } from '../../../shared/schemas';
import { requireAdmin } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody, parseQuery, pathParam } from '../../lib/http';
import { adminProDetail, adminStats, adminSubscriptions } from '../../services/admin';
import { listFeedback, setFeedbackStatus } from '../../services/feedback';
import { recordManualPayment, rejectPaymentNotice } from '../../services/payments';

/**
 * Admin (`admin` Cognito group): stats, subscriptions, professional detail,
 * manual payments (incl. approving a "Ya pagué" notice via `noticeId`),
 * rejecting notices and the «Ayúdanos a mejorar» messages.
 */
export const handler = createApiHandler({
  'GET /admin/feedback': async (event) => {
    requireAdmin(event);
    return ok(await listFeedback());
  },

  'POST /admin/feedback/status': async (event) => {
    requireAdmin(event);
    const input = parseBody(event, updateFeedbackStatusSchema);
    await setFeedbackStatus(input.proId, input.createdAt, input.status);
    return ok({ ok: true });
  },

  'GET /admin/stats': async (event) => {
    requireAdmin(event);
    return ok(await adminStats());
  },

  'GET /admin/subscriptions': async (event) => {
    requireAdmin(event);
    const query = parseQuery(event, listSubscriptionsQuerySchema);
    return ok({ rows: await adminSubscriptions(query) });
  },

  'GET /admin/pros/{proId}': async (event) => {
    requireAdmin(event);
    return ok(await adminProDetail(pathParam(event, 'proId')));
  },

  'POST /admin/pros/{proId}/manual-payments': async (event) => {
    const admin = requireAdmin(event);
    const input = parseBody(event, manualPaymentSchema);
    return created(await recordManualPayment(admin, pathParam(event, 'proId'), input));
  },

  'POST /admin/pros/{proId}/payment-notices/{paymentId}/reject': async (event) => {
    const admin = requireAdmin(event);
    const { reason } = parseBody(event, rejectNoticeSchema);
    const payment = await rejectPaymentNotice(admin, pathParam(event, 'proId'), pathParam(event, 'paymentId'), reason);
    return ok({ payment });
  },
});
