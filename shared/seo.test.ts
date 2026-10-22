import { describe, expect, it } from 'vitest';
import { renderSitemap, robotsTxt } from './seo';

describe('robotsTxt', () => {
  it('prod: blocks token links, referrals and templates and points to the sitemap', () => {
    expect(robotsTxt({ siteUrl: 'https://separame.app', indexable: true })).toBe(
      [
        'User-agent: *',
        'Disallow: /c/',
        'Disallow: /w/',
        'Disallow: /r/',
        'Disallow: /_templates/',
        '',
        'Sitemap: https://separame.app/sitemap.xml',
        '',
      ].join('\n'),
    );
  });

  it('dev: names no sitemap (the noindex header keeps it out of search)', () => {
    const robots = robotsTxt({ siteUrl: 'https://dev.separame.app/', indexable: false });
    expect(robots).not.toContain('Sitemap:');
    expect(robots).toContain('X-Robots-Tag: noindex');
    expect(robots).toContain('Disallow: /c/');
  });
});

describe('renderSitemap', () => {
  it('lists the landing, the legal pages and the profiles, sorted and deduplicated', () => {
    const xml = renderSitemap('https://separame.app/', ['dra-laura', 'barberia-el-parche', 'dra-laura', '']);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs).toEqual([
      'https://separame.app/',
      'https://separame.app/privacy',
      'https://separame.app/terms',
      'https://separame.app/barberia-el-parche',
      'https://separame.app/dra-laura',
    ]);
  });

  it('escapes XML and is stable for the same input', () => {
    expect(renderSitemap('https://separame.app', ['a&b'])).toContain('<loc>https://separame.app/a&amp;b</loc>');
    expect(renderSitemap('https://separame.app', ['b', 'a'])).toBe(renderSitemap('https://separame.app', ['a', 'b']));
  });
});
