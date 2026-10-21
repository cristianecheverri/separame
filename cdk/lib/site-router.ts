/**
 * Source of the CloudFront Function (viewer request, cloudfront-js-2.0) that
 * routes every request to the right object in the site bucket. Kept as a
 * plain string builder so it can be unit-tested with `node:vm` (see
 * tests/site-router.test.ts) exactly as CloudFront will run it.
 *
 * Bucket layout it maps onto:
 *   /index.html, /404.html     landing + not-found (frontend/booking)
 *   /c/index.html              client cancel/reschedule page (/c/<token>)
 *   /b/…                       booking bundle (stable entries + hashed assets)
 *   /_templates/booking.html   profile page template (read by stream-publish)
 *   /<slug>/index.html         static profile pages (written by the backend)
 *   /app/…                     professional panel + admin SPA (frontend/app)
 *
 * Rules, in order:
 *   1. host `www.<apex>` (prod)  → 301 https://<apex><uri>?<query>
 *   2. `/app`                    → 301 `/app/`
 *   3. `/app/…` without a file extension → `/app/index.html` (SPA routes)
 *   4. `/c/…` without a file extension   → `/c/index.html`
 *   5. `/`                       → `/index.html`
 *   6. one segment without a dot, optional trailing slash → `/<slug>/index.html`
 *   7. anything else unchanged (missing objects → /404.html via error responses)
 */
import { SITE_PATHS } from '../../shared/infra';

export interface SiteRouterOptions {
  /** Canonical host; when `redirectHosts` is non-empty they 301 here. */
  canonicalHost: string;
  /** Hosts that must permanently redirect to `canonicalHost` (e.g. www). */
  redirectHosts: string[];
}

export function siteRouterCode(options: SiteRouterOptions): string {
  // JSON.stringify gives safe JS literals for the injected values.
  const appPrefix = SITE_PATHS.app; // '/app/'
  return `var CANONICAL_HOST = ${JSON.stringify(options.canonicalHost)};
var REDIRECT_HOSTS = ${JSON.stringify(options.redirectHosts)};
var APP_PREFIX = ${JSON.stringify(appPrefix)};
var APP_ROOT = ${JSON.stringify(appPrefix.replace(/\/$/, ''))};
var APP_INDEX = ${JSON.stringify(`${appPrefix}index.html`)};
var MANAGE_PREFIX = ${JSON.stringify(SITE_PATHS.manage)};
var MANAGE_INDEX = ${JSON.stringify(SITE_PATHS.manageIndex)};

function queryString(query) {
  var parts = [];
  for (var key in query) {
    var entry = query[key];
    var values = entry.multiValue ? entry.multiValue : [entry];
    for (var i = 0; i < values.length; i++) {
      parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
    }
  }
  return parts.length ? '?' + parts.join('&') : '';
}

function redirect(location) {
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: { location: { value: location }, 'cache-control': { value: 'max-age=3600' } }
  };
}

function hasExtension(uri) {
  var last = uri.substring(uri.lastIndexOf('/') + 1);
  return last.indexOf('.') !== -1;
}

function handler(event) {
  var request = event.request;
  var uri = request.uri;
  var host = request.headers.host ? request.headers.host.value : '';

  if (REDIRECT_HOSTS.indexOf(host) !== -1) {
    return redirect('https://' + CANONICAL_HOST + uri + queryString(request.querystring));
  }
  if (uri === APP_ROOT) {
    return redirect(APP_PREFIX + queryString(request.querystring));
  }
  if (uri.indexOf(APP_PREFIX) === 0) {
    if (!hasExtension(uri)) request.uri = APP_INDEX;
    return request;
  }
  if (uri.indexOf(MANAGE_PREFIX) === 0) {
    if (!hasExtension(uri)) request.uri = MANAGE_INDEX;
    return request;
  }
  if (uri === '/') {
    request.uri = '/index.html';
    return request;
  }
  var match = uri.match(/^\\/([^\\/.]+)\\/?$/);
  if (match) {
    request.uri = '/' + match[1] + '/index.html';
  }
  return request;
}
`;
}
