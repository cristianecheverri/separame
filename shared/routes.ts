/**
 * Route → Lambda map for the HTTP API. The CDK app creates one function per
 * entry in `API_FUNCTIONS` and wires every route in `ROUTES` to it; each
 * handler dispatches on `event.routeKey`. Small, specific functions (one per
 * route group) instead of one Lambda that does everything.
 */

export type AuthLevel = 'public' | 'pro' | 'admin';

export interface FunctionDef {
  /** Suffix of the function name: `separame-<stage>-<name>`. */
  name: string;
  /** Entry file, relative to the repo root. */
  entry: string;
  description: string;
  memoryMb?: number;
  timeoutSec?: number;
}

const fn = (name: string, description: string, extra: Partial<FunctionDef> = {}): FunctionDef => ({
  name,
  entry: `backend/functions/${name}/index.ts`,
  description,
  ...extra,
});

export const API_FUNCTIONS = {
  publicPro: fn('public-pro', 'Public profile and availability of a professional'),
  publicBooking: fn('public-booking', 'Client creates a booking (atomic slot locks)'),
  publicAppointment: fn('public-appointment', 'Client views, cancels or reschedules via signed link'),
  proAccount: fn('pro-account', 'Current professional: me, onboarding, profile, slug check'),
  proServices: fn('pro-services', 'Professional services CRUD'),
  proAvailability: fn('pro-availability', 'Weekly schedule, booking rules and blocked days'),
  proAppointments: fn('pro-appointments', 'Professional calendar: list, create, move, cancel'),
  proBilling: fn('pro-billing', 'Plans, payment instructions, history and "Ya pagué" notices'),
  calendarSync: fn('calendar-sync', 'Calendar subscription feed (.ics) for the pro and calendar-invite settings'),
  waitlist: fn('waitlist', 'Waitlist: clients join/leave; the pro lists and removes entries'),
  proClients: fn('pro-clients', 'Client history per professional: list, detail, notes, delete'),
  proStats: fn('pro-stats', 'Professional statistics for a date range'),
  proNotifications: fn('pro-notifications', 'Web push subscriptions of the professional (PWA)'),
  adminSubscriptions: fn('admin-subscriptions', 'Admin: stats, subscriptions, pro detail, manual payments'),
  adminPrices: fn('admin-prices', 'Admin: price versions and price migrations'),
} as const;

export type ApiFunctionKey = keyof typeof API_FUNCTIONS;

/** Functions not behind the HTTP API. */
export const BACKGROUND_FUNCTIONS = {
  jobsTick: fn('jobs-tick', 'Every 10 min: 24 h reminders, renewal notices, price migrations', { timeoutSec: 120 }),
  /**
   * The ONE consumer of appointment events (DynamoDB recommends ≤ 2 readers per
   * stream shard; stream-publish is the other). Modules inside: emails + calendar
   * invites, client history aggregates, waitlist offers, web push to the pro.
   */
  streamAppointments: fn('stream-appointments', 'DynamoDB stream: appointment events → emails, client history, waitlist offers, web push', { timeoutSec: 60 }),
  streamPublish: fn('stream-publish', 'DynamoDB stream: regenerate the static /<slug> page on profile/service changes', { timeoutSec: 60 }),
  sesFeedback: fn('ses-feedback', 'SES bounces/complaints via SNS: suppress the address'),
  cognitoPreSignUp: fn('cognito-pre-signup', 'Cognito: reject disposable email domains'),
  cognitoCustomMessage: fn('cognito-custom-message', 'Cognito: branded sign-in code email'),
} as const;

export type BackgroundFunctionKey = keyof typeof BACKGROUND_FUNCTIONS;

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** HTTP API path template (`{param}`). */
  path: string;
  fn: ApiFunctionKey;
  auth: AuthLevel;
  /** Stricter throttling for routes that create bookings. */
  throttle?: 'booking';
}

export const ROUTES: RouteDef[] = [
  // Public — no auth
  { method: 'GET', path: '/public/pros/{slug}', fn: 'publicPro', auth: 'public' },
  { method: 'GET', path: '/public/pros/{slug}/availability', fn: 'publicPro', auth: 'public' },
  { method: 'POST', path: '/public/pros/{slug}/bookings', fn: 'publicBooking', auth: 'public', throttle: 'booking' },
  { method: 'GET', path: '/public/appointments/{token}', fn: 'publicAppointment', auth: 'public' },
  { method: 'POST', path: '/public/appointments/{token}/cancel', fn: 'publicAppointment', auth: 'public', throttle: 'booking' },
  { method: 'POST', path: '/public/appointments/{token}/reschedule', fn: 'publicAppointment', auth: 'public', throttle: 'booking' },
  { method: 'POST', path: '/public/appointments/{token}/confirm', fn: 'publicAppointment', auth: 'public' },
  { method: 'POST', path: '/public/pros/{slug}/waitlist', fn: 'waitlist', auth: 'public', throttle: 'booking' },
  { method: 'POST', path: '/public/waitlist/{token}/leave', fn: 'waitlist', auth: 'public' },
  // Secret-URL calendar feed that Google/Outlook/Apple poll: /public/calendar/<token>.ics
  { method: 'GET', path: '/public/calendar/{file}', fn: 'calendarSync', auth: 'public' },

  // Professional — Cognito JWT
  { method: 'GET', path: '/me', fn: 'proAccount', auth: 'pro' },
  { method: 'POST', path: '/me/onboarding', fn: 'proAccount', auth: 'pro' },
  { method: 'PUT', path: '/me/profile', fn: 'proAccount', auth: 'pro' },
  { method: 'GET', path: '/me/slug-check', fn: 'proAccount', auth: 'pro' },

  { method: 'GET', path: '/me/services', fn: 'proServices', auth: 'pro' },
  { method: 'POST', path: '/me/services', fn: 'proServices', auth: 'pro' },
  { method: 'PUT', path: '/me/services/{serviceId}', fn: 'proServices', auth: 'pro' },
  { method: 'DELETE', path: '/me/services/{serviceId}', fn: 'proServices', auth: 'pro' },

  { method: 'GET', path: '/me/availability', fn: 'proAvailability', auth: 'pro' },
  { method: 'PUT', path: '/me/availability', fn: 'proAvailability', auth: 'pro' },
  { method: 'POST', path: '/me/blocks', fn: 'proAvailability', auth: 'pro' },
  { method: 'DELETE', path: '/me/blocks/{blockId}', fn: 'proAvailability', auth: 'pro' },

  { method: 'GET', path: '/me/appointments', fn: 'proAppointments', auth: 'pro' },
  { method: 'POST', path: '/me/appointments', fn: 'proAppointments', auth: 'pro' },
  { method: 'PATCH', path: '/me/appointments/{appointmentId}', fn: 'proAppointments', auth: 'pro' },
  { method: 'POST', path: '/me/appointments/{appointmentId}/cancel', fn: 'proAppointments', auth: 'pro' },
  { method: 'GET', path: '/me/slots', fn: 'proAppointments', auth: 'pro' },
  { method: 'POST', path: '/me/appointments/{appointmentId}/outcome', fn: 'proAppointments', auth: 'pro' },

  { method: 'GET', path: '/me/waitlist', fn: 'waitlist', auth: 'pro' },
  { method: 'DELETE', path: '/me/waitlist/{entryId}', fn: 'waitlist', auth: 'pro' },

  { method: 'GET', path: '/me/clients', fn: 'proClients', auth: 'pro' },
  { method: 'GET', path: '/me/clients/{clientKey}', fn: 'proClients', auth: 'pro' },
  { method: 'PUT', path: '/me/clients/{clientKey}/notes', fn: 'proClients', auth: 'pro' },
  { method: 'DELETE', path: '/me/clients/{clientKey}', fn: 'proClients', auth: 'pro' },

  { method: 'GET', path: '/me/stats', fn: 'proStats', auth: 'pro' },

  { method: 'GET', path: '/me/push-config', fn: 'proNotifications', auth: 'pro' },
  { method: 'POST', path: '/me/push-subscriptions', fn: 'proNotifications', auth: 'pro' },
  { method: 'POST', path: '/me/push-subscriptions/remove', fn: 'proNotifications', auth: 'pro' },
  { method: 'POST', path: '/me/push-subscriptions/test', fn: 'proNotifications', auth: 'pro' },

  { method: 'GET', path: '/me/calendar-sync', fn: 'calendarSync', auth: 'pro' },
  { method: 'PUT', path: '/me/calendar-sync', fn: 'calendarSync', auth: 'pro' },
  { method: 'POST', path: '/me/calendar-sync/rotate', fn: 'calendarSync', auth: 'pro' },

  { method: 'GET', path: '/me/billing', fn: 'proBilling', auth: 'pro' },
  { method: 'POST', path: '/me/billing/payment-notices', fn: 'proBilling', auth: 'pro' },

  // Admin — Cognito JWT + `admin` group (checked in the handler)
  { method: 'GET', path: '/admin/stats', fn: 'adminSubscriptions', auth: 'admin' },
  { method: 'GET', path: '/admin/subscriptions', fn: 'adminSubscriptions', auth: 'admin' },
  { method: 'GET', path: '/admin/pros/{proId}', fn: 'adminSubscriptions', auth: 'admin' },
  { method: 'POST', path: '/admin/pros/{proId}/manual-payments', fn: 'adminSubscriptions', auth: 'admin' },
  { method: 'POST', path: '/admin/pros/{proId}/payment-notices/{paymentId}/reject', fn: 'adminSubscriptions', auth: 'admin' },

  { method: 'GET', path: '/admin/prices', fn: 'adminPrices', auth: 'admin' },
  { method: 'POST', path: '/admin/prices', fn: 'adminPrices', auth: 'admin' },
  { method: 'PATCH', path: '/admin/prices/{priceId}', fn: 'adminPrices', auth: 'admin' },
  { method: 'GET', path: '/admin/price-migrations', fn: 'adminPrices', auth: 'admin' },
  { method: 'POST', path: '/admin/price-migrations', fn: 'adminPrices', auth: 'admin' },
  { method: 'POST', path: '/admin/price-migrations/{migrationId}/cancel', fn: 'adminPrices', auth: 'admin' },
];

export const routeKey = (r: Pick<RouteDef, 'method' | 'path'>) => `${r.method} ${r.path}`;
