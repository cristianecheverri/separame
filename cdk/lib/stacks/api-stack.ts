import * as cdk from 'aws-cdk-lib';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as authorizers from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import type * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { HOSTED_ZONE_ID, ROOT_DOMAIN } from '../../../shared/infra';
import { API_FUNCTIONS, ROUTES, routeKey, type ApiFunctionKey } from '../../../shared/routes';
import type { StageConfig } from '../config';
import { grantReadStageParameters, grantSendEmail, grantSitePublishing, type MailSender } from '../grants';
import { commonEnvironment, createFunction } from '../lambda';

export interface ApiStackProps extends cdk.StackProps {
  config: StageConfig;
  table: dynamodb.ITable;
  userPool: cognito.IUserPool;
  userPoolClient: cognito.IUserPoolClient;
  siteBucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  mail: MailSender;
}

/** Stage-wide throttling (also protects the account concurrency shared with Cartazos). */
export const DEFAULT_THROTTLE = { rateLimit: 50, burstLimit: 100 } as const;
/** Routes that create or change bookings. */
export const BOOKING_THROTTLE = { rateLimit: 5, burstLimit: 10 } as const;

/** API functions that write or delete static pages on the site bucket (old slug pages; the landing's prices). */
const SITE_PUBLISHERS: readonly ApiFunctionKey[] = ['proAccount', 'adminPrices'];

/**
 * The HTTP API at `api.<site>`: one small NodejsFunction per entry of
 * `API_FUNCTIONS` (each dispatches on `event.routeKey`) and one route per entry
 * of `ROUTES`, both from shared/routes.ts.
 *  - Public routes have no auth. Professional and admin routes use the
 *    Cognito JWT authorizer (the SPA sends the ID token as a Bearer token);
 *    the `admin` group is checked inside the handler.
 *  - CORS only for the site origin (plus the Vite dev servers in dev), with
 *    a 24 h preflight cache.
 *  - Throttling on the default stage, much lower on booking routes.
 */
export class ApiStack extends cdk.Stack {
  public readonly httpApi: apigwv2.HttpApi;
  public readonly functions: Record<ApiFunctionKey, lambdaNode.NodejsFunction>;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config, table, userPool, userPoolClient, siteBucket, distribution, mail } = props;

    // ── Custom domain ─────────────────────────────────────────────────────
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ROOT_DOMAIN,
    });
    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: config.apiDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
    const domainName = new apigwv2.DomainName(this, 'DomainName', {
      domainName: config.apiDomain,
      certificate,
    });

    // ── API ───────────────────────────────────────────────────────────────
    this.httpApi = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `${config.prefix}-api`,
      description: `Sepárame ${config.stage} API`,
      // Only the custom domain should be used.
      disableExecuteApiEndpoint: true,
      corsPreflight: {
        allowOrigins: config.corsOrigins,
        allowHeaders: ['content-type', 'authorization'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        maxAge: cdk.Duration.hours(24),
      },
    });

    new apigwv2.ApiMapping(this, 'ApiMapping', {
      api: this.httpApi,
      domainName,
      stage: this.httpApi.defaultStage,
    });

    const aliasTarget = route53.RecordTarget.fromAlias(
      new route53Targets.ApiGatewayv2DomainProperties(domainName.regionalDomainName, domainName.regionalHostedZoneId),
    );
    new route53.ARecord(this, 'ApiA', { zone, recordName: config.apiDomain, target: aliasTarget });
    new route53.AaaaRecord(this, 'ApiAaaa', { zone, recordName: config.apiDomain, target: aliasTarget });

    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${config.region}.amazonaws.com/${userPool.userPoolId}`,
      {
        authorizerName: 'cognito',
        jwtAudience: [userPoolClient.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      },
    );

    // ── Functions ─────────────────────────────────────────────────────────
    const environment = commonEnvironment(config, { table, siteBucket, distribution, userPool });
    const functions = {} as Record<ApiFunctionKey, lambdaNode.NodejsFunction>;
    const integrationsByFn = {} as Record<ApiFunctionKey, integrations.HttpLambdaIntegration>;

    for (const key of Object.keys(API_FUNCTIONS) as ApiFunctionKey[]) {
      const fn = createFunction(this, { config, def: API_FUNCTIONS[key], environment });
      table.grantReadWriteData(fn);
      grantReadStageParameters(fn, config, this);
      grantSendEmail(fn, mail);
      if (SITE_PUBLISHERS.includes(key)) grantSitePublishing(fn, siteBucket, distribution);
      functions[key] = fn;
      // One invoke permission per function (not per route) keeps the policy small.
      integrationsByFn[key] = new integrations.HttpLambdaIntegration(`${fn.node.id}Integration`, fn, {
        scopePermissionToRoute: false,
      });
    }
    this.functions = functions;

    // Admin detail shows the professional's Cognito account state.
    functions.adminSubscriptions.addToRolePolicy(
      new iam.PolicyStatement({ actions: ['cognito-idp:AdminGetUser'], resources: [userPool.userPoolArn] }),
    );

    // ── Routes ────────────────────────────────────────────────────────────
    const throttledRoutes: apigwv2.HttpRoute[] = [];
    for (const route of ROUTES) {
      const [created] = this.httpApi.addRoutes({
        path: route.path,
        methods: [apigwv2.HttpMethod[route.method]],
        integration: integrationsByFn[route.fn],
        ...(route.auth === 'public' ? {} : { authorizer: jwtAuthorizer }),
      });
      if (route.throttle === 'booking') throttledRoutes.push(created);
    }

    // ── Throttling (L1: the L2 default stage exposes no route settings) ───
    const stage = this.httpApi.defaultStage!.node.defaultChild as apigwv2.CfnStage;
    stage.defaultRouteSettings = {
      throttlingRateLimit: DEFAULT_THROTTLE.rateLimit,
      throttlingBurstLimit: DEFAULT_THROTTLE.burstLimit,
    };
    // `routeSettings` is raw JSON (untyped in the L1): CloudFormation casing.
    stage.routeSettings = Object.fromEntries(
      ROUTES.filter((r) => r.throttle === 'booking').map((r) => [
        routeKey(r),
        { ThrottlingRateLimit: BOOKING_THROTTLE.rateLimit, ThrottlingBurstLimit: BOOKING_THROTTLE.burstLimit },
      ]),
    );
    // Route settings fail ("Unable to find Route by key") if the stage is
    // updated before the routes exist.
    throttledRoutes.forEach((route) => stage.node.addDependency(route));

    new cdk.CfnOutput(this, 'ApiUrl', { value: config.apiUrl });
    new cdk.CfnOutput(this, 'HttpApiId', { value: this.httpApi.apiId });
  }
}
