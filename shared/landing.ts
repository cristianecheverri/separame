/**
 * Landing page pricing (pure, shared by the booking build and the backend).
 *
 * The landing (`/`) is static HTML. Its prices come from the active default
 * price version, never from hardcoded copy:
 *  - frontend/booking renders the template at build time with
 *    `LANDING_DEFAULT_PRICE` (so the deployed file is never empty) and keeps
 *    the slot markers in the HTML;
 *  - backend/services/landing.ts re-renders that template with the real
 *    version whenever it changes (admin edits + the 10-minute job) and writes
 *    it over `index.html`.
 * `GET /public/prices` returns the same `PublicPricesResponse`.
 */
import type { PublicPricePackage, PublicPricesResponse } from './api';
import { formatCop } from './format';
import { TRIAL_DAYS } from './subscription';
import type { PriceVersion } from './types';

/**
 * Build-time fallback; mirrors the default seed in backend/services/prices.ts
 * (a backend test keeps them equal).
 */
export const LANDING_DEFAULT_PRICE: PriceVersion = {
  id: 'fundador-v1',
  code: 'fundador-v1',
  name: 'Fundador',
  currency: 'COP',
  monthlyCop: 5000,
  packages: [
    { months: 3, amountCop: 15000 },
    { months: 6, amountCop: 30000 },
    { months: 12, amountCop: 50000 },
  ],
  extraProfessionalCop: 3900,
  status: 'active',
  isDefault: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

const perMonth = (p: { months: number; amountCop: number }) => p.amountCop / p.months;

/** Founder pricing is a version whose code or name says so ("fundador-v1" / "Fundador"). */
export const isFounderPrice = (price: Pick<PriceVersion, 'code' | 'name'>): boolean =>
  /fundador|founder/i.test(price.code) || /fundador/i.test(price.name);

/** The public view of a price version (same rules as the panel's plan cards). */
export function toPublicPrices(price: PriceVersion, trialDays: number = TRIAL_DAYS): PublicPricesResponse {
  const sorted = [...price.packages].sort((a, b) => {
    if (a.months === 1) return 1;
    if (b.months === 1) return -1;
    return a.months - b.months;
  });
  const multi = sorted.filter((p) => p.months > 1);
  const cheapest = multi.length ? multi.reduce((best, p) => (perMonth(p) < perMonth(best) ? p : best)) : null;
  const bestIsDiscounted = !!cheapest && multi.some((p) => perMonth(p) > perMonth(cheapest));
  const reference = price.monthlyCop;

  const packages: PublicPricePackage[] = sorted.map((p) => {
    const free = reference && p.months > 1 ? Math.round(p.months - p.amountCop / reference) : 0;
    return {
      months: p.months,
      amountCop: p.amountCop,
      monthlyCop: Math.round(perMonth(p)),
      freeMonths: Math.max(0, free),
      best: bestIsDiscounted && p === cheapest,
    };
  });

  const lowestMonthly = packages.length ? Math.min(...packages.map((p) => p.monthlyCop)) : 0;
  return {
    priceVersionId: price.id,
    name: price.name,
    founder: isFounderPrice(price),
    currency: 'COP',
    fromMonthlyCop: reference ?? lowestMonthly,
    trialDays,
    packages,
  };
}

// ── HTML slots ─────────────────────────────────────────────────────────────

/**
 * `<!--price:NAME-->…<!--/price:NAME-->` regions of the landing template:
 *  - `from`     "$5.000" (headline monthly price; may appear many times)
 *  - `plans`    the package cards
 *  - `founder`  the "Precio fundador" banner, dropped for non-founder versions
 *  - `jsonld`   the SoftwareApplication JSON-LD block (in <head>)
 * Markers survive rendering, so the output can be rendered again.
 */
export const LANDING_SLOT_NAMES = ['from', 'plans', 'founder', 'jsonld'] as const;
export type LandingSlot = (typeof LANDING_SLOT_NAMES)[number];

const SLOT_RE = /<!--price:([a-z]+)-->([\s\S]*?)<!--\/price:\1-->/g;

const LANDING_URL = 'https://separame.app/';

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** JSON safe inside a <script> element. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
}

function planCard(pkg: PublicPricePackage, prices: PublicPricesResponse): string {
  const oneMonth = pkg.months === 1;
  const tag = pkg.best ? 'El más conveniente' : oneMonth ? 'Flexible' : `Precio ${prices.name.toLowerCase()}`;
  const name = oneMonth ? 'Mes a mes' : `${pkg.months} meses`;
  let monthly = oneMonth ? 'Sin compromiso' : `${formatCop(pkg.monthlyCop)} al mes`;
  if (pkg.best && pkg.freeMonths >= 1) monthly += ` · ${pkg.freeMonths} ${pkg.freeMonths === 1 ? 'mes gratis' : 'meses gratis'}`;
  return [
    `<article class="plan${pkg.best ? ' plan-best' : ''}">`,
    `<span class="plan-tag">${escapeHtml(tag)}</span>`,
    `<h3 class="plan-name">${name}</h3>`,
    `<div class="plan-amount">${formatCop(pkg.amountCop)}</div>`,
    `<div class="plan-monthly">${monthly}</div>`,
    '</article>',
  ].join('');
}

export function renderPlans(prices: PublicPricesResponse): string {
  return prices.packages.map((pkg) => planCard(pkg, prices)).join('');
}

export function renderJsonLd(prices: PublicPricesResponse): string {
  const amounts = prices.packages.map((p) => p.amountCop);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Sepárame',
    url: LANDING_URL,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'es-CO',
    description:
      'Agenda de citas en línea para profesionales en Colombia: tus clientes separan cita desde un enlace, sin llamadas, con recordatorios automáticos.',
    ...(amounts.length
      ? {
          offers: {
            '@type': 'AggregateOffer',
            priceCurrency: prices.currency,
            lowPrice: Math.min(...amounts),
            highPrice: Math.max(...amounts),
            offerCount: amounts.length,
          },
        }
      : {}),
  };
  return `<script type="application/ld+json">${scriptJson(data)}</script>`;
}

/** Fills every price slot of the landing HTML (a replacer function: no `$` patterns from admin text). */
export function renderLandingPrices(html: string, prices: PublicPricesResponse): string {
  const fill = (source: string): string =>
    source.replace(SLOT_RE, (_match, name: string, content: string) => {
      const wrap = (inner: string) => `<!--price:${name}-->${inner}<!--/price:${name}-->`;
      switch (name as LandingSlot) {
        case 'from':
          return wrap(formatCop(prices.fromMonthlyCop));
        case 'plans':
          return wrap(renderPlans(prices));
        case 'founder':
          return wrap(prices.founder ? fill(content) : '');
        case 'jsonld':
          return wrap(renderJsonLd(prices));
        default:
          return wrap(fill(content));
      }
    });
  return fill(html);
}

/** Slot names present in a template (the build and the backend refuse templates without them). */
export function landingSlotsIn(html: string): Set<string> {
  return new Set([...html.matchAll(SLOT_RE)].map((m) => m[1]));
}
