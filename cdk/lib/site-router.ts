/**
 * Source of the CloudFront Function (viewer request, cloudfront-js-2.0) that
 * routes every request to the right object in the site bucket. Kept as a
 * plain string builder so it can be unit-tested with `node:vm` (see
 * tests/site-router.test.ts) exactly as CloudFront will run it.
 *
 * Bucket layout it maps onto:
 *   /index.html, /404.html     landing + not-found (frontend/booking)
 *   /c/index.html              client cancel/reschedule page (/c/<token>)
 *   /w/index.html              leave-the-waitlist page (/w/<token>)
 *   /b/…                       booking bundle (stable entries + hashed assets)
 *   /_templates/booking.html   profile page template (read by stream-publish)
 *   /<slug>/index.html         static profile pages (written by the backend)
 *   /app/…                     professional panel + admin SPA (frontend/app)
 *
 * Rules, in order:
 *   1. host `www.<apex>` (prod)  → 301 https://<apex><uri>?<query>
 *   2. `/app`                    → 301 `/app/`
 *   3. `/app/…` without a file extension → `/app/index.html` (SPA routes)
 *   4. `/c/…` / `/w/…` without a file extension → `/c/index.html` / `/w/index.html`
 *   5. `/r/<code>` (referral link) → 302 `/app/signup?ref=<code>` (other query params kept);
 *      `/r`, `/r/` or a malformed code → 302 `/app/signup`
 *   6. `/`                       → `/index.html`
 *   7. one segment without a dot, optional trailing slash → `/<slug>/index.html`
 *   8. anything else unchanged (missing objects → /404.html via error responses)
 */
import { SITE_PATHS } from '../../shared/infra';
import { REFERRAL_PATH, REFERRAL_QUERY_PARAM } from '../../shared/referrals';

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
var TOKEN_PAGES = ${JSON.stringify([
    { prefix: SITE_PATHS.manage, index: SITE_PATHS.manageIndex },
    { prefix: SITE_PATHS.waitlistLeave, index: SITE_PATHS.waitlistLeaveIndex },
  ])};
var REFERRAL_PREFIX = ${JSON.stringify(REFERRAL_PATH)};
var SIGNUP_PATH = ${JSON.stringify(`${appPrefix}signup`)};
var REFERRAL_PARAM = ${JSON.stringify(REFERRAL_QUERY_PARAM)};

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

/** Temporary (302): where a referral link lands may change; browsers must not cache it forever. */
function found(location) {
  return {
    statusCode: 302,
    statusDescription: 'Found',
    headers: { location: { value: location }, 'cache-control': { value: 'no-store' } }
  };
}

function referralRedirect(uri, query) {
  var code = uri.substring(REFERRAL_PREFIX.length).replace(/\\/+$/, '').toLowerCase();
  var rest = queryString(query);
  if (!/^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/.test(code)) return found(SIGNUP_PATH + rest);
  return found(SIGNUP_PATH + '?' + REFERRAL_PARAM + '=' + code + (rest ? '&' + rest.substring(1) : ''));
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
  for (var i = 0; i < TOKEN_PAGES.length; i++) {
    if (uri.indexOf(TOKEN_PAGES[i].prefix) === 0) {
      if (!hasExtension(uri)) request.uri = TOKEN_PAGES[i].index;
      return request;
    }
  }
  if (uri === REFERRAL_PREFIX.slice(0, -1) || uri.indexOf(REFERRAL_PREFIX) === 0) {
    return referralRedirect(uri, request.querystring);
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
