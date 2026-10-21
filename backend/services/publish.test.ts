import { describe, expect, it } from 'vitest';
import type { PublicProfile } from '../../shared/api';
import { SITE_PATHS } from '../../shared/infra';
import { jsonForScript, pagePaths, renderProfilePage } from './publish';

const template = `<!doctype html><html lang="es"><head><meta charset="utf-8">${SITE_PATHS.templateHeadMarker}<script src="/b/booking.js" defer></script></head><body><div id="app"></div>${SITE_PATHS.templateDataMarker}</body></html>`;

const profile: PublicProfile = {
  slug: 'dra-laura-perez', name: 'Dra. Laura "La" Pérez <b>', title: 'Odontóloga', city: 'Medellín', neighborhood: 'El Poblado', address: 'Cra. 43A $& #1-50',
  phone: null, initials: 'LP',
  services: [{ id: 's1', name: 'Valoración </script><script>alert(1)</script>', durationMin: 30, priceCop: 60000, description: '' }],
};
const cfg = { siteUrl: 'https://separame.app', apiUrl: 'https://api.separame.app', turnstileSiteKey: 'site-key' };

describe('renderProfilePage', () => {
  const html = renderProfilePage(template, profile, cfg);

  it('replaces both markers', () => {
    expect(html).not.toContain(SITE_PATHS.templateHeadMarker);
    expect(html).not.toContain(SITE_PATHS.templateDataMarker);
  });

  it('writes escaped SEO and Open Graph tags', () => {
    expect(html).toContain('<title>Agenda de Dra. Laura &quot;La&quot; Pérez &lt;b&gt; · Sepárame</title>');
    expect(html).toContain('<meta name="description" content="Odontóloga en Medellín. Separa tu cita en línea en segundos.">');
    expect(html).toContain('<link rel="canonical" href="https://separame.app/dra-laura-perez">');
    expect(html).toContain('<meta property="og:image" content="https://separame.app/og.png">');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image">');
  });

  it('embeds the profile + config as JSON that cannot break out of the script tag', () => {
    const match = /<script type="application\/json" id="separame-data">(.*?)<\/script>/s.exec(html);
    expect(match).not.toBeNull();
    expect(match![1]).not.toContain('<');
    const data = JSON.parse(match![1]);
    expect(data.profile.services[0].name).toBe('Valoración </script><script>alert(1)</script>');
    expect(data.profile.address).toBe('Cra. 43A $& #1-50');
    expect(data.config).toEqual({ turnstileSiteKey: 'site-key', apiUrl: 'https://api.separame.app' });
  });

  it('escapes line separators for inline scripts', () => {
    expect(jsonForScript({ a: 'x y' })).toBe('{"a":"x\\u2028y"}');
  });

  it('invalidates every path that can serve the page', () => {
    expect(pagePaths('dra-laura-perez')).toEqual(['/dra-laura-perez', '/dra-laura-perez/', '/dra-laura-perez/index.html']);
  });
});
