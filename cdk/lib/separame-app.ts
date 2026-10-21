import * as cdk from 'aws-cdk-lib';
import { REGION } from '../../shared/infra';
import { parseStage, stackId, stageConfig, type StageConfig } from './config';
import { ApiStack } from './stacks/api-stack';
import { AuthStack } from './stacks/auth-stack';
import { CiCdStack } from './stacks/cicd-stack';
import { DataStack } from './stacks/data-stack';
import { FrontendDeployStack } from './stacks/frontend-deploy-stack';
import { MailStack } from './stacks/mail-stack';
import { MonitoringStack } from './stacks/monitoring-stack';
import { SiteStack } from './stacks/site-stack';
import { WorkersStack } from './stacks/workers-stack';

export interface SeparameStacks {
  config: StageConfig;
  data: DataStack;
  mail: MailStack;
  auth: AuthStack;
  site: SiteStack;
  api: ApiStack;
  workers: WorkersStack;
  frontendDeploy: FrontendDeployStack;
  monitoring: MonitoringStack;
  cicd?: CiCdStack;
}

export const GITHUB_REPOSITORY = 'cristianecheverri/separame';
/** Same repo with GitHub's immutable ids — the form its OIDC tokens actually use (seen in CloudTrail). */
export const GITHUB_REPOSITORY_WITH_IDS = 'cristianecheverri@37417336/separame@1427543331';

/**
 * Wires every stack of one stage. Shared by bin/app.ts and the tests.
 *
 * Context:
 *   -c stage=dev|prod        required
 *   -c frontendBuild=skip    placeholder frontends (CI synth, tests)
 *   -c cicd=true             (prod only) also synthesize SeparameCiCd
 *   -c turnstileSiteKey=…    override the prod Turnstile site key (default: shared/infra.ts)
 *
 * Dependency order (no cycles):
 *   Data → Mail → Auth ─┐
 *   Site ───────────────┼→ Api → FrontendDeploy
 *   Data, Mail, Site ───┴→ Workers
 *   Workers → Monitoring (DLQs are referenced by name)
 */
export function buildSeparame(app: cdk.App, account = process.env.CDK_DEFAULT_ACCOUNT): SeparameStacks {
  const stage = parseStage(app.node.tryGetContext('stage'));
  const config = stageConfig(app, stage);
  // The local AWS profile defaults to us-east-2: the region is pinned here.
  const env = { account, region: REGION };
  const id = (name: string) => stackId(stage, name);

  // `Project` (capital P) is the cost-allocation tag key already active in
  // Billing for this account (shared with Cartazos).
  cdk.Tags.of(app).add('Project', 'separame');
  cdk.Tags.of(app).add('Stage', stage);

  const data = new DataStack(app, id('Data'), { env, config });

  const mail = new MailStack(app, id('Mail'), { env, config, table: data.table });

  const auth = new AuthStack(app, id('Auth'), { env, config, table: data.table });
  // Cognito sends through the SES identity + configuration set, which are
  // referenced by name (no token), so the order must be explicit.
  auth.addStackDependency(mail);

  const site = new SiteStack(app, id('Site'), { env, config });

  const api = new ApiStack(app, id('Api'), {
    env,
    config,
    table: data.table,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    siteBucket: site.bucket,
    distribution: site.distribution,
    mail: mail.sender,
  });

  if (config.turnstileTestKeyInProd) {
    cdk.Annotations.of(api).addWarningV2(
      'separame:turnstileTestKey',
      'prod is using the Turnstile TEST site key (always passes). Set TURNSTILE_PROD_SITE_KEY in shared/infra.ts.',
    );
  }

  const workers = new WorkersStack(app, id('Workers'), {
    env,
    config,
    table: data.table,
    siteBucket: site.bucket,
    distribution: site.distribution,
    mail: mail.sender,
  });

  const frontendDeploy = new FrontendDeployStack(app, id('FrontendDeploy'), {
    env,
    config,
    bucket: site.bucket,
    distribution: site.distribution,
    userPool: auth.userPool,
    userPoolClient: auth.userPoolClient,
    skipBuild: app.node.tryGetContext('frontendBuild') === 'skip',
  });
  // A client must never reach users before the API routes it calls exist:
  // without this, `deploy --all --concurrency` can ship the frontend first.
  frontendDeploy.addStackDependency(api);

  const monitoring = new MonitoringStack(app, id('Monitoring'), { env, config });
  // The DLQ alarm references the queues by name; create it after them.
  monitoring.addStackDependency(workers);

  // Account-wide OIDC deploy role, deployed once by hand (see CiCdStack).
  const cicdRequested = String(app.node.tryGetContext('cicd')) === 'true';
  const cicd =
    stage === 'prod' && cicdRequested
      ? new CiCdStack(app, 'SeparameCiCd', { env, repository: GITHUB_REPOSITORY, repositoryWithIds: GITHUB_REPOSITORY_WITH_IDS })
      : undefined;

  return { config, data, mail, auth, site, api, workers, frontendDeploy, monitoring, cicd };
}
