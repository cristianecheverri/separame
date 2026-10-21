import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import * as path from 'path';
import { ENV } from '../../shared/infra';
import type { FunctionDef } from '../../shared/routes';
import type { StageConfig } from './config';

/**
 * Shared NodejsFunction factory. Centralizes the runtime defaults and attaches
 * an explicit LogGroup (with retention) instead of the deprecated
 * `logRetention` prop — no deprecation warning and no log-retention custom
 * resource. `backend/` and `shared/` live at the repo root, so `projectRoot`
 * and `depsLockFilePath` point there (the root has esbuild + a lock file), and
 * `@aws-sdk/*` stays external (provided by the Node.js runtime).
 */
export const REPO_ROOT = path.join(__dirname, '../..');
const DEPS_LOCK = path.join(REPO_ROOT, 'package-lock.json');

/** Default for HTTP API handlers (the API Gateway integration caps at 30 s). */
const DEFAULT_TIMEOUT_SEC = 10;
/** More memory = more CPU = shorter cold starts, at almost the same cost. */
const DEFAULT_MEMORY_MB = 512;

export interface SeparameFunctionProps {
  config: StageConfig;
  def: FunctionDef;
  environment?: Record<string, string>;
}

/** `pro-account` → `ProAccount` (construct ids). */
export function constructIdOf(name: string): string {
  return name
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');
}

export function functionNameOf(config: Pick<StageConfig, 'prefix'>, def: Pick<FunctionDef, 'name'>): string {
  return `${config.prefix}-${def.name}`;
}

export function createFunction(scope: Construct, props: SeparameFunctionProps): lambdaNode.NodejsFunction {
  const { config, def } = props;
  const id = constructIdOf(def.name);
  const functionName = functionNameOf(config, def);

  const logGroup = new logs.LogGroup(scope, `${id}Logs`, {
    logGroupName: `/aws/lambda/${functionName}`,
    retention: logs.RetentionDays.TWO_WEEKS,
    removalPolicy: cdk.RemovalPolicy.DESTROY,
  });

  return new lambdaNode.NodejsFunction(scope, id, {
    functionName,
    description: def.description,
    entry: path.join(REPO_ROOT, def.entry),
    handler: 'handler',
    projectRoot: REPO_ROOT,
    depsLockFilePath: DEPS_LOCK,
    runtime: lambda.Runtime.NODEJS_24_X,
    architecture: lambda.Architecture.ARM_64,
    memorySize: def.memoryMb ?? DEFAULT_MEMORY_MB,
    timeout: cdk.Duration.seconds(def.timeoutSec ?? DEFAULT_TIMEOUT_SEC),
    logGroup,
    bundling: {
      minify: true,
      sourceMap: true,
      target: 'node24',
      externalModules: ['@aws-sdk/*'],
    },
    environment: {
      NODE_OPTIONS: '--enable-source-maps',
      ...props.environment,
    },
  });
}

/** Resources a stack can hand to `commonEnvironment` (whatever it has in scope). */
export interface EnvironmentResources {
  table?: dynamodb.ITable;
  siteBucket?: s3.IBucket;
  distribution?: cloudfront.IDistribution;
  userPool?: cognito.IUserPool;
}

/**
 * The `ENV` variables from shared/infra.ts. Plain config values are always
 * set; resource names only when the stack has that resource available (e.g.
 * the Cognito triggers can't receive their own USER_POOL_ID — that would be a
 * circular reference — and get it from the trigger event instead).
 */
export function commonEnvironment(config: StageConfig, resources: EnvironmentResources = {}): Record<string, string> {
  const env: Record<string, string> = {
    [ENV.stage]: config.stage,
    [ENV.siteUrl]: config.siteUrl,
    [ENV.apiUrl]: config.apiUrl,
    [ENV.mailFrom]: config.mailFrom,
    [ENV.mailConfigSet]: config.configSetName,
    [ENV.ssmPrefix]: config.ssmPrefix,
    [ENV.adminEmail]: config.adminEmail,
    [ENV.turnstileSiteKey]: config.turnstileSiteKey,
  };
  if (resources.table) env[ENV.tableName] = resources.table.tableName;
  if (resources.siteBucket) env[ENV.siteBucket] = resources.siteBucket.bucketName;
  if (resources.distribution) env[ENV.siteDistributionId] = resources.distribution.distributionId;
  if (resources.userPool) env[ENV.userPoolId] = resources.userPool.userPoolId;
  return env;
}
