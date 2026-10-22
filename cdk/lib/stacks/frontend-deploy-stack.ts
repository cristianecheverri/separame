import * as cdk from 'aws-cdk-lib';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { execSync } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { SITE_PATHS } from '../../../shared/infra';
import { ROBOTS_KEY, robotsTxt } from '../../../shared/seo';
import type { StageConfig } from '../config';
import { REPO_ROOT } from '../lambda';

export interface FrontendDeployStackProps extends cdk.StackProps {
  config: StageConfig;
  bucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  /** `-c frontendBuild=skip`: tiny placeholders instead of real builds (CI synth, tests). */
  skipBuild: boolean;
}

/** Runtime config the panel SPA fetches at boot from `/app/config.json`. */
export interface AppRuntimeConfig {
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
  region: string;
  stage: string;
  siteUrl: string;
}

const NO_CACHE = s3deploy.CacheControl.fromString('no-cache');
const IMMUTABLE = s3deploy.CacheControl.fromString('public, max-age=31536000, immutable');
const APP_PREFIX = SITE_PATHS.app.replace(/^\//, ''); // 'app/'
const APP_CONFIG_FILE = path.posix.basename(SITE_PATHS.appConfig); // 'config.json'

/**
 * Builds both frontends and uploads them to the site bucket:
 *  - frontend/booking → bucket root (landing, 404, /c/ and /w/ pages, booking bundle,
 *    profile template), plus the stage's robots.txt (shared/seo.ts). `prune: false` is CRITICAL: the root also holds the
 *    backend-generated `/<slug>/index.html` profile pages, which a deploy must
 *    never delete.
 *  - frontend/app → `app/` (prune limited to that prefix), plus
 *    `app/config.json` with the API URL and Cognito ids, so the SPA needs no
 *    build-time configuration.
 *
 * Cache-Control, two passes per frontend (as in Cartazos): everything is first
 * uploaded `no-cache` (HTML shells and the stable `b/booking.*` entries are
 * revalidated on every load — cheap 304s), then the content-hashed assets are
 * re-stamped as immutable. The four deployments run in sequence and the last
 * one invalidates `/*`.
 *
 * Depends on ApiStack (declared in the app): the clients must never reach
 * users before the API routes they call exist.
 */
export class FrontendDeployStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendDeployStackProps) {
    super(scope, id, props);
    const { config, bucket, distribution, userPool, userPoolClient, skipBuild } = props;

    const booking = skipBuild ? bookingPlaceholders() : [frontendSource('booking')];
    const app = skipBuild ? appPlaceholders() : [frontendSource('app')];

    const runtimeConfig: AppRuntimeConfig = {
      apiUrl: config.apiUrl,
      userPoolId: userPool.userPoolId,
      userPoolClientId: userPoolClient.userPoolClientId,
      region: config.region,
      stage: config.stage,
      siteUrl: config.siteUrl,
    };

    const common = {
      destinationBucket: bucket,
      memoryLimit: 1024,
      ephemeralStorageSize: cdk.Size.mebibytes(1024),
    };

    // Per stage (dev is not indexable), so it ships here instead of in the build.
    const robots = s3deploy.Source.data(ROBOTS_KEY, robotsTxt({ siteUrl: config.siteUrl, indexable: config.indexable }));

    const bookingBase = new s3deploy.BucketDeployment(this, 'BookingDeployment', {
      ...common,
      sources: [...booking, robots],
      prune: false, // never delete /<slug>/index.html profile pages
      cacheControl: [NO_CACHE],
    });
    const bookingAssets = new s3deploy.BucketDeployment(this, 'BookingAssetsImmutable', {
      ...common,
      sources: booking,
      prune: false,
      exclude: ['*'],
      include: ['b/assets/*'],
      cacheControl: [IMMUTABLE],
    });

    // config.json ships in the same deployment as the SPA: a separate one
    // would be deleted by this deployment's prune.
    const appBase = new s3deploy.BucketDeployment(this, 'AppDeployment', {
      ...common,
      sources: [...app, s3deploy.Source.jsonData(APP_CONFIG_FILE, runtimeConfig)],
      destinationKeyPrefix: APP_PREFIX,
      prune: true, // only within app/
      cacheControl: [NO_CACHE],
    });
    const appAssets = new s3deploy.BucketDeployment(this, 'AppAssetsImmutable', {
      ...common,
      sources: app,
      destinationKeyPrefix: APP_PREFIX,
      prune: false,
      exclude: ['*'],
      include: ['assets/*'],
      cacheControl: [IMMUTABLE],
      distribution,
      distributionPaths: ['/*'],
      // Request the invalidation but don't block the deploy on it (it finishes on its
      // own in ~1–2 min; waiting made every frontend deploy take ~15 extra minutes).
      // Safe: HTML and the stable /b/booking.* entries are served `no-cache` anyway.
      waitForDistributionInvalidation: false,
    });

    bookingAssets.node.addDependency(bookingBase);
    appBase.node.addDependency(bookingAssets);
    appAssets.node.addDependency(appBase);
  }
}

/**
 * `npm ci && npm run build` in frontend/<name>, locally (fast, used by CI and
 * local deploys) with a Docker fallback. The asset is rooted at the repo so
 * the Docker build can see `shared/` and the root lock file; its hash covers
 * the frontend sources plus everything it imports from outside its folder.
 */
function frontendSource(name: 'booking' | 'app'): s3deploy.ISource {
  const dir = path.join(REPO_ROOT, 'frontend', name);
  if (!fs.existsSync(path.join(dir, 'package.json'))) {
    throw new Error(`frontend/${name} has no package.json. Build it first, or synth with -c frontendBuild=skip.`);
  }

  return s3deploy.Source.asset(REPO_ROOT, {
    assetHashType: cdk.AssetHashType.CUSTOM,
    assetHash: hashSources([dir, path.join(REPO_ROOT, 'shared'), path.join(REPO_ROOT, 'frontend/tailwind.preset.cjs')]),
    bundling: {
      local: {
        tryBundle(outputDir: string): boolean {
          try {
            execSync('npm ci --prefer-offline --no-audit', { cwd: dir, stdio: 'inherit' });
            execSync('npm run build', { cwd: dir, stdio: 'inherit' });
            fs.cpSync(path.join(dir, 'dist'), outputDir, { recursive: true });
            return true;
          } catch {
            return false;
          }
        },
      },
      image: cdk.DockerImage.fromRegistry('node:24-alpine'),
      command: [
        'sh',
        '-c',
        `npm ci --no-audit && cd frontend/${name} && npm ci --no-audit && npm run build && cp -r dist/. /asset-output/`,
      ],
    },
  });
}

const HASH_IGNORED = new Set(['node_modules', 'dist', 'dev-dist', '.vite', 'coverage']);

/** Deterministic content hash of files/directories (skips build output and deps). */
function hashSources(paths: string[]): string {
  const hash = crypto.createHash('sha256');
  const visit = (current: string): void => {
    if (!fs.existsSync(current)) return;
    const stat = fs.statSync(current);
    if (stat.isDirectory()) {
      for (const entry of fs.readdirSync(current).sort()) {
        if (!HASH_IGNORED.has(entry)) visit(path.join(current, entry));
      }
      return;
    }
    hash.update(path.relative(REPO_ROOT, current));
    hash.update(fs.readFileSync(current));
  };
  paths.forEach(visit);
  return hash.digest('hex');
}

const placeholderHtml = (title: string) =>
  `<!doctype html><html lang="es"><meta charset="utf-8"><title>${title}</title><p>${title}</p></html>`;

/** Site path → bucket key (`/c/index.html` → `c/index.html`). */
const keyOf = (sitePath: string) => sitePath.replace(/^\//, '');

function bookingPlaceholders(): s3deploy.ISource[] {
  return [
    s3deploy.Source.data('index.html', placeholderHtml('Sepárame (placeholder build)')),
    s3deploy.Source.data(keyOf(SITE_PATHS.notFound), placeholderHtml('Página no encontrada (placeholder)')),
    s3deploy.Source.data(keyOf(SITE_PATHS.manageIndex), placeholderHtml('Tu cita (placeholder)')),
    s3deploy.Source.data(keyOf(SITE_PATHS.waitlistLeaveIndex), placeholderHtml('Lista de espera (placeholder)')),
  ];
}

function appPlaceholders(): s3deploy.ISource[] {
  return [s3deploy.Source.data('index.html', placeholderHtml('Sepárame panel (placeholder build)'))];
}
