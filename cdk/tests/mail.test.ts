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
