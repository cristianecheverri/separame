import { describe, expect, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';
import { API_FUNCTIONS, ROUTES, routeKey } from '../../shared/routes';
import { BOOKING_THROTTLE, DEFAULT_THROTTLE } from '../lib/stacks/api-stack';
import { resourcesOf, templateOf } from './helpers';

describe('ApiStack', () => {
  const template = templateOf('dev', (s) => s.api);

  it('creates one ARM64 Node.js 24 function per API_FUNCTIONS entry with the common env', () => {
    const names = Object.values(API_FUNCTIONS).map((def) => `separame-dev-${def.name}`);
    const functions = resourcesOf(template, 'AWS::Lambda::Function').map(([, r]) => r.Properties);
    expect(functions.map((p) => p.FunctionName).sort()).toEqual(names.sort());
    for (const props of functions) {
      expect(props).toMatchObject({ Runtime: 'nodejs24.x', Architectures: ['arm64'], MemorySize: 512 });
      const vars = (props.Environment as { Variables: Record<string, unknown> }).Variables;
      expect(Object.keys(vars)).toEqual(
        expect.arrayContaining([
          'STAGE', 'TABLE_NAME', 'SITE_URL', 'API_URL', 'SITE_BUCKET', 'SITE_DISTRIBUTION_ID', 'MAIL_FROM',
          'MAIL_CONFIG_SET', 'USER_POOL_ID', 'SSM_PREFIX', 'ADMIN_EMAIL', 'TURNSTILE_SITE_KEY', 'NODE_OPTIONS',
        ]),
      );
      expect(vars).toMatchObject({
        STAGE: 'dev',
        SITE_URL: 'https://dev.separame.app',
        API_URL: 'https://api.dev.separame.app',
        MAIL_FROM: 'Sepárame <noreply@dev.separame.app>',
        SSM_PREFIX: '/separame/dev',
        ADMIN_EMAIL: 'crisechevrri@gmail.com',
      });
    }
  });

  it('wires every route; pro/admin routes use the JWT authorizer and public ones do not', () => {
    const routes = resourcesOf(template, 'AWS::ApiGatewayV2::Route').map(([, r]) => r.Properties);
    expect(routes).toHaveLength(ROUTES.length);
    for (const route of ROUTES) {
      const props = routes.find((p) => p.RouteKey === routeKey(route));
      expect(props, routeKey(route)).toBeDefined();
      if (route.auth === 'public') {
        expect(props!.AuthorizationType ?? 'NONE').toBe('NONE');
        expect(props!.AuthorizerId).toBeUndefined();
      } else {
        expect(props!.AuthorizationType).toBe('JWT');
        expect(props!.AuthorizerId).toBeDefined();
      }
    }
  });

  it('uses a Cognito JWT authorizer with the web client as audience', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Authorizer', {
      AuthorizerType: 'JWT',
      IdentitySource: ['$request.header.Authorization'],
      JwtConfiguration: {
        Audience: [Match.anyValue()],
        Issuer: Match.anyValue(),
      },
    });
  });

  it('throttles the stage and, more strictly, the booking routes', () => {
    const bookingKeys = ROUTES.filter((r) => r.throttle === 'booking').map(routeKey);
    expect(bookingKeys.length).toBeGreaterThan(0);
    const [[, stage]] = resourcesOf(template, 'AWS::ApiGatewayV2::Stage');
    expect(stage.Properties.DefaultRouteSettings).toEqual({
      ThrottlingRateLimit: DEFAULT_THROTTLE.rateLimit,
      ThrottlingBurstLimit: DEFAULT_THROTTLE.burstLimit,
    });
    const routeSettings = stage.Properties.RouteSettings as Record<string, unknown>;
    expect(Object.keys(routeSettings).sort()).toEqual([...bookingKeys].sort());
    for (const key of bookingKeys) {
      expect(routeSettings[key]).toEqual({
        ThrottlingRateLimit: BOOKING_THROTTLE.rateLimit,
        ThrottlingBurstLimit: BOOKING_THROTTLE.burstLimit,
      });
    }
  });

  it('allows CORS from the site and the local dev servers (dev)', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::Api', {
      Name: 'separame-dev-api',
      CorsConfiguration: Match.objectLike({
        AllowOrigins: ['https://dev.separame.app', 'http://localhost:5173', 'http://localhost:5174'],
        AllowHeaders: ['content-type', 'authorization'],
        MaxAge: 86400,
      }),
    });
    templateOf('prod', (s) => s.api).hasResourceProperties('AWS::ApiGatewayV2::Api', {
      CorsConfiguration: Match.objectLike({ AllowOrigins: ['https://separame.app'] }),
    });
  });

  it('lets only pro-account write the site bucket and invalidate the distribution', () => {
    const policies = resourcesOf(template, 'AWS::IAM::Policy');
    const publishers = policies
      .filter(([, r]) => JSON.stringify(r.Properties.PolicyDocument).includes('cloudfront:CreateInvalidation'))
      .map(([id]) => id);
    expect(publishers).toHaveLength(1);
    expect(publishers[0]).toMatch(/^ProAccount/);
    const adminPolicy = policies.find(([id]) => id.startsWith('AdminSubscriptions'))!;
    expect(JSON.stringify(adminPolicy[1].Properties.PolicyDocument)).toContain('cognito-idp:AdminGetUser');
  });

  it('maps the custom domain', () => {
    template.hasResourceProperties('AWS::ApiGatewayV2::DomainName', { DomainName: 'api.dev.separame.app' });
    template.resourceCountIs('AWS::ApiGatewayV2::ApiMapping', 1);
  });
});
