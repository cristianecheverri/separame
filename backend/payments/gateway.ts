import type { PaymentMethod, PaymentProvider } from '../../shared/types';

/**
 * Payment gateway seam — intentionally WITHOUT implementations. Today
 * professionals pay by Nequi / bank transfer and report it with "Ya pagué"
 * (see services/payments.ts); an admin approves it.
 *
 * Adding a gateway later (Nequi's own, Wompi, Mercado Pago…):
 *  1. Implement `PaymentGateway` in `backend/payments/<provider>.ts`
 *     (checkout URL/session, webhook signature check, event parsing). Keys go
 *     in SSM under `/separame/<stage>/<provider>/...`.
 *  2. Add a route `POST /me/billing/checkout` (or per provider) that calls
 *     `createCheckout` for one of the pro's price-version packages.
 *  3. Add its own Lambda + public route `POST /webhooks/<provider>` (in
 *     shared/routes.ts) that: verifies the signature → 401 when invalid;
 *     parses the event; is idempotent by `provider + transactionId` (a
 *     conditional marker written in the SAME transaction as the payment);
 *     on `approved`, checks amount/currency against the package and calls
 *     `applyApprovedPayment` with `source: 'gateway'` and `gateway` details;
 *     always answers 200 to valid duplicates.
 *  Subscriptions, admin and the panel don't change.
 */

export interface CheckoutRequest {
  proId: string;
  months: number;
  amountCop: number;
  /** Our reference, e.g. `SEP-<proId>-<months>-<ts36>` (parseable in the webhook). */
  reference: string;
  /** Where the gateway sends the professional back (`<SITE_URL>/app/billing?payment=return`). */
  redirectUrl: string;
  customerEmail: string;
}

export interface CheckoutSession {
  /** URL to open (hosted checkout) — the panel redirects there. */
  checkoutUrl: string;
  reference: string;
}

export interface WebhookRequest {
  /** Exact raw body (signatures are computed over it). */
  rawBody: string;
  headers: Record<string, string | undefined>;
}

/** Gateway-agnostic outcome of a webhook event. */
export interface NormalizedPaymentEvent {
  provider: PaymentProvider;
  transactionId: string;
  reference: string;
  status: 'approved' | 'declined' | 'pending' | 'voided' | 'error';
  /** Provider's own status string, kept for audit (`Payment.gateway.rawStatus`). */
  rawStatus: string;
  amountCop: number;
  currency: string;
  method: PaymentMethod;
  paidAt: string;
}

export interface PaymentGateway {
  provider: PaymentProvider;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** Signature/checksum verification (constant-time compare). */
  verifyWebhook(request: WebhookRequest): Promise<boolean>;
  /** null for events we don't care about. */
  parseEvent(request: WebhookRequest): NormalizedPaymentEvent | null;
}
