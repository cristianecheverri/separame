import { paymentNoticeSchema } from '../../../shared/schemas';
import { requirePro } from '../../lib/auth';
import { created, createApiHandler, ok, parseBody } from '../../lib/http';
import { createPaymentNotice, getPaymentInstructions, listPayments } from '../../services/payments';
import { requirePrice } from '../../services/prices';
import { requireProId } from '../../services/profiles';
import { myReferrals } from '../../services/referrals';
import { loadSubscription } from '../../services/subscriptions';

/**
 * Plan, how to pay (Nequi / transfer instructions from SSM), payment history,
 * the "Ya pagué" notice and the referral program. No read-only gate: an expired
 * professional must be able to pay and tell us — that's how the agenda comes back
 * (and their referral link keeps earning saved months).
 */
export const handler = createApiHandler({
  'GET /me/billing': async (event) => {
    const proId = await requireProId(requirePro(event));
    const { status } = await loadSubscription(proId);
    const [price, payments, instructions] = await Promise.all([
      requirePrice(status.priceVersionId), listPayments(proId), getPaymentInstructions(),
    ]);
    return ok({ subscription: status, price, payments, instructions });
  },

  'POST /me/billing/payment-notices': async (event) => {
    const input = parseBody(event, paymentNoticeSchema);
    const proId = await requireProId(requirePro(event));
    return created({ payment: await createPaymentNotice(proId, input) });
  },

  'GET /me/referrals': async (event) => {
    const proId = await requireProId(requirePro(event));
    return ok(await myReferrals(proId));
  },
});
