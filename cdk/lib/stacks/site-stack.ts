import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import { Construct } from 'constructs';
import { HOSTED_ZONE_ID, ROOT_DOMAIN, SITE_PATHS } from '../../../shared/infra';
import type { StageConfig } from '../config';
import { siteRouterCode } from '../site-router';

export interface SiteStackProps extends cdk.StackProps {
  config: StageConfig;
}

/**
 * The website's storage and edge — no content. One private S3 bucket behind
 * CloudFront (OAC) serves the landing page, the booking bundle, the
 * backend-generated `/<slug>` profile pages and the `/app/` SPA. A viewer
 * request CloudFront Function (lib/site-router.ts) maps clean URLs onto that
 * layout. Content is uploaded by FrontendDeployStack (frontends) and by the
 * backend (profile pages), which is why the bucket and distribution are
 * exposed to the other stacks.
 */
export class SiteStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: SiteStackProps) {
    super(scope, id, props);
    const { config } = props;
    const domainNames = [config.siteDomain, ...config.siteAliases];

    this.bucket = new s3.Bucket(this, 'Bucket', {
      // Bucket names are global: the account id keeps them unique.
      bucketName: `${config.prefix}-site-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: config.removalPolicy,
      autoDeleteObjects: !config.retain,
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ROOT_DOMAIN,
    });

    const certificate = new acm.Certificate(this, 'Certificate', {
      domainName: config.siteDomain,
      subjectAlternativeNames: config.siteAliases.length ? config.siteAliases : undefined,
      validation: acm.CertificateValidation.fromDns(zone),
    });

    // ── Security headers ──────────────────────────────────────────────────
    // No inline scripts anywhere: the profile data travels in a
    // <script type="application/json"> block, which CSP doesn't execute.
    const csp = [
      `default-src 'self'`,
      `script-src 'self' https://challenges.cloudflare.com`,
      `style-src 'self' 'unsafe-inline'`,
      `font-src 'self' data:`,
      `img-src 'self' data: blob:`,
      `connect-src 'self' ${config.apiUrl} https://cognito-idp.${config.region}.amazonaws.com https://challenges.cloudflare.com`,
      `frame-src https://challenges.cloudflare.com`,
      `frame-ancestors 'none'`,
      `base-uri 'self'`,
      `object-src 'none'`,
      `form-action 'self'`,
    ].join('; ');

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      responseHeadersPolicyName: `${config.prefix}-site-headers`,
      comment: `Security headers for ${config.siteDomain}`,
      securityHeadersBehavior: {
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
        contentSecurityPolicy: { contentSecurityPolicy: csp, override: true },
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'Permissions-Policy',
            value: 'geolocation=(), microphone=(), camera=(), payment=(), usb=()',
            override: true,
          },
          // dev must never show up in search results (robots.txt still lets crawlers see this).
          ...(config.indexable ? [] : [{ header: 'X-Robots-Tag', value: 'noindex, nofollow', override: true }]),
        ],
      },
    });

    const router = new cloudfront.Function(this, 'Router', {
      functionName: `${config.prefix}-site-router`,
      comment: 'Clean URLs: /<slug>, /c/<token>, /app/* SPA, www → apex',
      runtime: cloudfront.FunctionRuntime.JS_2_0,
      code: cloudfront.FunctionCode.fromInline(
        siteRouterCode({ canonicalHost: config.siteDomain, redirectHosts: config.siteAliases }),
      ),
    });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Sepárame ${config.stage} - site`,
      domainNames,
      certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        // Honors each object's Cache-Control (no-cache shells, immutable assets).
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: securityHeaders,
        functionAssociations: [{ function: router, eventType: cloudfront.FunctionEventType.VIEWER_REQUEST }],
      },
      defaultRootObject: 'index.html',
      // Without s3:ListBucket a missing key is a 403; both render the 404 page.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 404,
        responsePagePath: SITE_PATHS.notFound,
        ttl: cdk.Duration.seconds(10),
      })),
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
    });

    const target = route53.RecordTarget.fromAlias(new route53Targets.CloudFrontTarget(this.distribution));
    domainNames.forEach((recordName, index) => {
      const suffix = index === 0 ? '' : `Alias${index}`;
      new route53.ARecord(this, `SiteA${suffix}`, { zone, recordName, target });
      new route53.AaaaRecord(this, `SiteAaaa${suffix}`, { zone, recordName, target });
    });

    if (config.siteVerification) {
      new route53.TxtRecord(this, 'SearchConsoleVerification', {
        zone,
        recordName: ROOT_DOMAIN,
        values: [config.siteVerification],
        ttl: cdk.Duration.hours(1),
      });
    }

    new cdk.CfnOutput(this, 'SiteUrl', { value: config.siteUrl });
    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    new cdk.CfnOutput(this, 'DistributionId', { value: this.distribution.distributionId });
  }
}
