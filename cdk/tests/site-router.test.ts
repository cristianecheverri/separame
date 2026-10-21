import { describe, expect, it } from 'vitest';
import * as vm from 'node:vm';
import { siteRouterCode, type SiteRouterOptions } from '../lib/site-router';
import { templateOf } from './helpers';

type Query = Record<string, { value: string; multiValue?: Array<{ value: string }> }>;
interface Request {
  uri: string;
  headers: Record<string, { value: string }>;
  querystring: Query;
}
interface Redirect {
  statusCode: number;
  headers: { location: { value: string } };
}

/** Evaluates the function source like CloudFront does and returns `handler`. */
function loadRouter(options: SiteRouterOptions): (event: { request: Request }) => Request | Redirect {
  const context = vm.createContext({});
  vm.runInContext(siteRouterCode(options), context);
  return context.handler as (event: { request: Request }) => Request | Redirect;
}

const prod = loadRouter({ canonicalHost: 'separame.app', redirectHosts: ['www.separame.app'] });
const dev = loadRouter({ canonicalHost: 'dev.separame.app', redirectHosts: [] });

function route(handler: typeof prod, uri: string, host = 'separame.app', querystring: Query = {}) {
  return handler({ request: { uri, headers: { host: { value: host } }, querystring } });
}
const uriOf = (handler: typeof prod, uri: string) => (route(handler, uri) as Request).uri;

describe('site router (CloudFront Function)', () => {
  it('301s www to the apex in prod, keeping path and query', () => {
    const res = route(prod, '/dra-laura', 'www.separame.app', {
      utm: { value: 'ig' },
      tag: { value: 'a', multiValue: [{ value: 'a' }, { value: 'b' }] },
    }) as Redirect;
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe('https://separame.app/dra-laura?utm=ig&tag=a&tag=b');
  });

  it('does not redirect any host in dev', () => {
    expect(uriOf(dev, '/')).toBe('/index.html');
    expect((route(dev, '/x', 'www.separame.app') as Request).uri).toBe('/x/index.html');
  });

  it('redirects /app to /app/ and serves the SPA for extensionless /app/ paths', () => {
    const res = route(prod, '/app') as Redirect;
    expect(res.statusCode).toBe(301);
    expect(res.headers.location.value).toBe('/app/');
    expect(uriOf(prod, '/app/')).toBe('/app/index.html');
    expect(uriOf(prod, '/app/calendar')).toBe('/app/index.html');
    expect(uriOf(prod, '/app/admin/pros/123')).toBe('/app/index.html');
    expect(uriOf(prod, '/app/assets/index-abc123.js')).toBe('/app/assets/index-abc123.js');
    expect(uriOf(prod, '/app/config.json')).toBe('/app/config.json');
  });

  it('serves the client manage page for /c/<token>', () => {
    expect(uriOf(prod, '/c/eyJhbGciOi-xyz')).toBe('/c/index.html');
    expect(uriOf(prod, '/c/')).toBe('/c/index.html');
    expect(uriOf(prod, '/c/index.html')).toBe('/c/index.html');
  });

  it('serves the leave-the-waitlist page for /w/<token>', () => {
    expect(uriOf(prod, '/w/eyJhbGciOi-xyz')).toBe('/w/index.html');
    expect(uriOf(prod, '/w/')).toBe('/w/index.html');
    expect(uriOf(prod, '/w/index.html')).toBe('/w/index.html');
    expect(uriOf(prod, '/w/logo.png')).toBe('/w/logo.png');
  });

  it('302s referral links /r/<code> to the signup page with the code (other params kept)', () => {
    const res = route(prod, '/r/laura-perez') as Redirect & { statusCode: number };
    expect(res.statusCode).toBe(302);
    expect(res.headers.location.value).toBe('/app/signup?ref=laura-perez');
    const withQuery = route(prod, '/r/Laura-Perez/', 'separame.app', { utm_source: { value: 'whatsapp' } }) as Redirect;
    expect(withQuery.headers.location.value).toBe('/app/signup?ref=laura-perez&utm_source=whatsapp');
  });

  it('sends /r, /r/ and malformed referral codes to the plain signup page', () => {
    for (const uri of ['/r', '/r/', '/r/x', '/r/<script>', '/r/a/b', '/r/-bad-']) {
      const res = route(prod, uri) as Redirect;
      expect(res.statusCode, uri).toBe(302);
      expect(res.headers.location.value, uri).toBe('/app/signup');
    }
  });

  it('serves the landing page at /', () => {
    expect(uriOf(prod, '/')).toBe('/index.html');
  });

  it('maps a single slug segment (with or without trailing slash) to its profile page', () => {
    expect(uriOf(prod, '/dra-laura-perez')).toBe('/dra-laura-perez/index.html');
    expect(uriOf(prod, '/dra-laura-perez/')).toBe('/dra-laura-perez/index.html');
  });

  it('leaves files and deeper paths untouched', () => {
    for (const uri of ['/index.html', '/404.html', '/favicon.ico', '/b/booking.js', '/b/assets/x-1.js', '/a/b', '/_templates/booking.html']) {
      expect(uriOf(prod, uri)).toBe(uri);
    }
  });

  it('is attached as a viewer-request JS 2.0 function with www redirect only in prod', () => {
    const prodSite = templateOf('prod', (s) => s.site);
    const fn = Object.values(prodSite.findResources('AWS::CloudFront::Function'))[0] as {
      Properties: { FunctionCode: string; FunctionConfig: { Runtime: string } };
    };
    expect(fn.Properties.FunctionConfig.Runtime).toBe('cloudfront-js-2.0');
    expect(fn.Properties.FunctionCode).toContain('["www.separame.app"]');
    const devFn = Object.values(templateOf('dev', (s) => s.site).findResources('AWS::CloudFront::Function'))[0] as {
      Properties: { FunctionCode: string };
    };
    expect(devFn.Properties.FunctionCode).toContain('var REDIRECT_HOSTS = [];');
  });
});
