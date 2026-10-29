import { describe, expect, it } from 'vitest';
import { LANDING_DEFAULT_PRICE, landingSlotsIn, renderLandingPrices, toPublicPrices } from './landing';
import { TRIAL_DAYS } from './subscription';
import type { PriceVersion } from './types';

const standard: PriceVersion = {
  ...LANDING_DEFAULT_PRICE,
  id: 'estandar-v1',
  code: 'estandar-v1',
  name: 'Estándar <b>',
  monthlyCop: 7000,
  packages: [
    { months: 1, amountCop: 7900 },
    { months: 12, amountCop: 70000 },
    { months: 6, amountCop: 39000 },
  ],
};

const template = [
  '<head><!--price:jsonld--><script type="application/ld+json">{}</script><!--/price:jsonld--></head>',
  '<p>Desde <!--price:from-->$1<!--/price:from--> al mes</p>',
  '<!--price:founder--><div class="founder">Precio fundador: <!--price:from-->$1<!--/price:from--></div><!--/price:founder-->',
  '<div class="plans"><!--price:plans--><article>old</article><!--/price:plans--></div>',
  '<p>Tu plan + <!--price:extra-->$1<!--/price:extra--> por profesional</p>',
].join('\n');

describe('toPublicPrices', () => {
  it('derives packages, monthly equivalents and the best deal from the founder version', () => {
    expect(toPublicPrices(LANDING_DEFAULT_PRICE)).toEqual({
      priceVersionId: 'fundador-v2',
      name: 'Fundador',
      founder: true,
      currency: 'COP',
      fromMonthlyCop: 5000,
      trialDays: TRIAL_DAYS,
      packages: [
        // 29-oct-2026: 3 months at the $5.000 reference, 6 for the price of 5, 12 for the price of 9, the month alone last.
        { months: 3, amountCop: 15000, monthlyCop: 5000, freeMonths: 0, best: false },
        { months: 6, amountCop: 25000, monthlyCop: 4167, freeMonths: 1, best: false },
        { months: 12, amountCop: 45000, monthlyCop: 3750, freeMonths: 3, best: true },
        { months: 1, amountCop: 5900, monthlyCop: 5900, freeMonths: 0, best: false },
      ],
      extraProfessionalCop: 3900,
    });
  });

  it('puts a 1-month package last and flags non-founder versions', () => {
    const view = toPublicPrices(standard, 7);
    expect(view.founder).toBe(false);
    expect(view.trialDays).toBe(7);
    expect(view.packages.map((p) => p.months)).toEqual([6, 12, 1]);
    expect(view.packages.find((p) => p.best)?.months).toBe(12);
  });

  it('has no best deal when every package costs the same per month', () => {
    const flat = { ...LANDING_DEFAULT_PRICE, packages: [{ months: 3, amountCop: 15000 }, { months: 6, amountCop: 30000 }] };
    expect(toPublicPrices(flat).packages.some((p) => p.best)).toBe(false);
  });

  it('falls back to the cheapest monthly equivalent when the version has no headline price', () => {
    expect(toPublicPrices({ ...LANDING_DEFAULT_PRICE, monthlyCop: null }).fromMonthlyCop).toBe(3750);
  });
});

describe('renderLandingPrices', () => {
  it('fills every slot and keeps the markers', () => {
    const html = renderLandingPrices(template, toPublicPrices(LANDING_DEFAULT_PRICE));
    expect(html).toContain('Desde <!--price:from-->$5.000<!--/price:from--> al mes');
    expect(html).toContain('Precio fundador: <!--price:from-->$5.000<!--/price:from-->');
    expect(html).not.toContain('old');
    expect(html).toContain('<article class="plan"><span class="plan-tag">Precio fundador</span><h3 class="plan-name">3 meses</h3><div class="plan-amount">$15.000</div><div class="plan-monthly">$5.000 al mes</div></article>');
    expect(html).toContain('<article class="plan plan-best"><span class="plan-tag">El más conveniente</span><h3 class="plan-name">12 meses</h3><div class="plan-amount">$45.000</div><div class="plan-monthly">$3.750 al mes · 3 meses gratis</div></article>');
    expect(html).toContain('<h3 class="plan-name">Mes a mes</h3><div class="plan-amount">$5.900</div><div class="plan-monthly">Sin compromiso</div>');
    expect([...landingSlotsIn(html)].sort()).toEqual(['extra', 'founder', 'from', 'jsonld', 'plans']);
  });

  it('writes SoftwareApplication JSON-LD with the price range', () => {
    const html = renderLandingPrices(template, toPublicPrices(LANDING_DEFAULT_PRICE));
    const json = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)![1];
    expect(JSON.parse(json)).toMatchObject({
      '@type': 'SoftwareApplication',
      offers: { '@type': 'AggregateOffer', priceCurrency: 'COP', lowPrice: 5900, highPrice: 45000, offerCount: 4 },
    });
  });

  it('drops the founder banner, escapes the version name and renders the 1-month package', () => {
    const html = renderLandingPrices(template, toPublicPrices(standard));
    expect(html).toContain('<!--price:founder--><!--/price:founder-->');
    expect(html).toContain('Precio estándar &lt;b&gt;');
    expect(html).toContain('<h3 class="plan-name">Mes a mes</h3><div class="plan-amount">$7.900</div><div class="plan-monthly">Sin compromiso</div>');
    expect(html).toContain('Desde <!--price:from-->$7.000<!--/price:from-->');
  });

  it('fills the team value per additional professional, keeping the text when a version has none', () => {
    expect(renderLandingPrices(template, toPublicPrices(LANDING_DEFAULT_PRICE))).toContain('Tu plan + <!--price:extra-->$3.900<!--/price:extra--> por profesional');
    const none = renderLandingPrices(template, toPublicPrices({ ...LANDING_DEFAULT_PRICE, extraProfessionalCop: null }));
    expect(none).toContain('<!--price:extra-->$1<!--/price:extra-->');
  });

  it('can render its own output again', () => {
    const once = renderLandingPrices(template, toPublicPrices(standard));
    const twice = renderLandingPrices(once, toPublicPrices(standard));
    expect(twice).toBe(once);
  });
});
