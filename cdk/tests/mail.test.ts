import { describe, expect, it } from 'vitest';
import { resourcesOf, templateOf } from './helpers';

describe('MailStack DNS', () => {
  it('dev DKIM CNAMEs use the fully qualified SES name (no duplicated zone)', () => {
    // Regression: the DKIM record name is a deploy-time token, so CDK appended
    // ".separame.app." to it and created "<token>._domainkey.dev.separame.app.separame.app",
    // which SES never finds — the identity stays unverified and Cognito fails to deploy.
    const template = templateOf('dev', (s) => s.mail);
    const cnames = resourcesOf(template, 'AWS::Route53::RecordSet').filter(([, r]) => r.Properties.Type === 'CNAME');
    expect(cnames).toHaveLength(3);
    for (const [, record] of cnames) {
      const name = JSON.stringify(record.Properties.Name);
      expect(name).toContain('DkimDNSTokenName');
      expect(name).not.toContain('separame.app');
      expect(name).toMatch(/"\."\]\]\}$/); // Fn::Join(['', [<token>, '.']])
    }
  });

  it('prod uses the apex hosted-zone identity (CDK creates the DKIM records itself)', () => {
    const template = templateOf('prod', (s) => s.mail);
    template.hasResourceProperties('AWS::SES::EmailIdentity', { EmailIdentity: 'separame.app' });
  });
});

describe('soporte@ inbound mail', () => {
  it('prod: MX on the apex, a rule on the shared active rule set to a 30-day bucket, and the forwarder', () => {
    const template = templateOf('prod', (s) => s.mail);
    template.hasResourceProperties('AWS::SES::ReceiptRule', {
      RuleSetName: 'blobhive-inbox',
      Rule: { Recipients: ['soporte@separame.app'], ScanEnabled: true, Enabled: true },
    });
    const mx = resourcesOf(template, 'AWS::Route53::RecordSet').filter(([, r]) => r.Properties.Type === 'MX');
    expect(mx.some(([, r]) => r.Properties.Name === 'separame.app.' && JSON.stringify(r.Properties.ResourceRecords).includes('inbound-smtp.us-east-1.amazonaws.com'))).toBe(true);
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'separame-prod-mail-forward',
      Environment: { Variables: { MAIL_FROM: 'soporte@separame.app', FORWARD_TO: 'crisechevrri@gmail.com' } },
    });
    template.hasResourceProperties('AWS::S3::Bucket', { LifecycleConfiguration: { Rules: [{ ExpirationInDays: 30, Status: 'Enabled' }] } });
  });

  it('dev: no inbound mail at all (the shared rule set is not touched)', () => {
    const template = templateOf('dev', (s) => s.mail);
    template.resourceCountIs('AWS::SES::ReceiptRule', 0);
  });
});

describe('Turnstile site key', () => {
  it('prod functions get the real public site key; dev gets the always-pass test key', async () => {
    const { TURNSTILE_PROD_SITE_KEY, TURNSTILE_TEST_KEYS } = await import('../../shared/infra');
    const envOf = (stage: 'dev' | 'prod') =>
      JSON.stringify(templateOf(stage, (s) => s.api).findResources('AWS::Lambda::Function'));
    expect(envOf('prod')).toContain(TURNSTILE_PROD_SITE_KEY);
    expect(envOf('prod')).not.toContain(TURNSTILE_TEST_KEYS.siteKey);
    expect(envOf('dev')).toContain(TURNSTILE_TEST_KEYS.siteKey);
  });
});
