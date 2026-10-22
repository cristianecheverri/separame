import { describe, expect, it } from 'vitest';
import * as cdk from 'aws-cdk-lib';
import { Match } from 'aws-cdk-lib/assertions';
import { buildSeparame } from '../lib/separame-app';
import type { Template } from 'aws-cdk-lib/assertions';
import { MAX_METRICS_PER_ALARM } from '../lib/stacks/monitoring-stack';
import { synthStage, templateOf, TEST_ACCOUNT } from './helpers';

describe('stages', () => {
  it('requires a valid -c stage', () => {
    expect(() => buildSeparame(new cdk.App({ context: { frontendBuild: 'skip' } }), TEST_ACCOUNT)).toThrow(/stage/);
    expect(() => buildSeparame(new cdk.App({ context: { stage: 'qa' } }), TEST_ACCOUNT)).toThrow(/stage/);
  });

  it('names stacks Separame<Stage><Name>, pins us-east-1 and tags everything', () => {
    const dev = synthStage('dev');
    expect(dev.api.stackName).toBe('SeparameDevApi');
    expect(dev.data.region).toBe('us-east-1');
    expect(synthStage('prod').frontendDeploy.stackName).toBe('SeparameProdFrontendDeploy');
    templateOf('dev', (s) => s.data).hasResourceProperties('AWS::DynamoDB::Table', {
      Tags: Match.arrayWith([
        { Key: 'Project', Value: 'separame' },
        { Key: 'Stage', Value: 'dev' },
      ]),
    });
  });

  it('retains and protects stateful resources only in prod', () => {
    templateOf('dev', (s) => s.site).hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Delete' });
    templateOf('prod', (s) => s.site).hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
  });

  it('serves www only in prod', () => {
    templateOf('prod', (s) => s.site).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['separame.app', 'www.separame.app'] }),
    });
    templateOf('dev', (s) => s.site).hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({ Aliases: ['dev.separame.app'] }),
    });
  });

  it('keeps dev out of search engines (X-Robots-Tag: noindex on every response)', () => {
    const customHeaders = (stage: 'dev' | 'prod') => {
      const policies = templateOf(stage, (s) => s.site).findResources('AWS::CloudFront::ResponseHeadersPolicy');
      const [policy] = Object.values(policies) as Array<{ Properties: { ResponseHeadersPolicyConfig: { CustomHeadersConfig: { Items: Array<{ Header: string; Value: string }> } } } }>;
      return policy.Properties.ResponseHeadersPolicyConfig.CustomHeadersConfig.Items;
    };
    expect(customHeaders('dev')).toContainEqual(expect.objectContaining({ Header: 'X-Robots-Tag', Value: 'noindex, nofollow' }));
    expect(customHeaders('prod').map((h) => h.Header)).not.toContain('X-Robots-Tag');
  });

  it('publishes the Search Console TXT record at the apex only in prod', () => {
    templateOf('dev', (s) => s.site).resourceCountIs('AWS::Route53::RecordSet', 2); // A + AAAA
    templateOf('prod', (s) => s.site).hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'separame.app.',
      Type: 'TXT',
      ResourceRecords: [Match.stringLikeRegexp('^"google-site-verification=.+"$')],
    });
  });

  it('creates the CiCd stack only for prod with -c cicd=true', () => {
    expect(synthStage('dev', { cicd: 'true' }).cicd).toBeUndefined();
    expect(synthStage('prod').cicd).toBeUndefined();
    const cicd = synthStage('prod', { cicd: 'true' }).cicd!;
    expect(cicd.stackName).toBe('SeparameCiCd');
  });

  it('dev has no alarms, topic or budget (account-wide alarms cover it)', () => {
    const dev = templateOf('dev', (s) => s.monitoring);
    dev.resourceCountIs('AWS::CloudWatch::Alarm', 0);
    dev.resourceCountIs('AWS::SNS::Topic', 0);
    dev.resourceCountIs('AWS::Budgets::Budget', 0);
  });

  it('prod only alarms on the stream DLQs (account-wide alarms live in Cartazos)', () => {
    const prod = templateOf('prod', (s) => s.monitoring);
    expect(alarmNames(prod)).toEqual(['separame-prod-dlq-messages']);
    prod.resourceCountIs('AWS::SNS::Topic', 1);
    const dlq = alarmsOf(prod)[0];
    const stats = dlq.Properties.Metrics!.filter((q) => q.MetricStat);
    expect(stats.map((q) => q.MetricStat!.Metric.Dimensions[0].Value).sort()).toEqual([
      'separame-prod-stream-appointments-dlq',
      'separame-prod-stream-publish-dlq',
    ]);
    expect(stats.length).toBeLessThanOrEqual(MAX_METRICS_PER_ALARM);
    expect(dlq.Properties.Metrics!.find((q) => q.Expression)!.Expression).toBe('SUM([FILL(m0, 0), FILL(m1, 0)])');
    expect(dlq.Properties.Threshold).toBe(0);
  });

  it('has the tag-filtered project budget only in prod', () => {
    templateOf('dev', (s) => s.monitoring).resourceCountIs('AWS::Budgets::Budget', 0);
    templateOf('prod', (s) => s.monitoring).hasResourceProperties('AWS::Budgets::Budget', {
      Budget: Match.objectLike({ CostFilters: { TagKeyValue: ['user:Project$separame'] } }),
    });
  });
});

type MetricQuery = { Expression?: string; MetricStat?: { Metric: { Dimensions: Array<{ Value: string }> } } };
type AlarmResource = { Properties: { AlarmName: string; Threshold: number; Metrics?: MetricQuery[] } };

function alarmsOf(template: Template): AlarmResource[] {
  return Object.values(template.findResources('AWS::CloudWatch::Alarm')) as AlarmResource[];
}

function alarmNames(template: Template): string[] {
  return alarmsOf(template)
    .map((a) => a.Properties.AlarmName)
    .sort();
}

describe('CiCd trust policy', () => {
  it('trusts both GitHub OIDC subject formats for main only', async () => {
    const { synthStage } = await import('./helpers');
    const { Template } = await import('aws-cdk-lib/assertions');
    const stacks = synthStage('prod', { cicd: 'true' });
    const role = Object.values(Template.fromStack(stacks.cicd!).findResources('AWS::IAM::Role'))[0] as {
      Properties: { AssumeRolePolicyDocument: { Statement: { Condition: { StringLike: Record<string, string[]> } }[] } };
    };
    const subs = role.Properties.AssumeRolePolicyDocument.Statement[0].Condition.StringLike['token.actions.githubusercontent.com:sub'];
    expect(subs).toEqual([
      'repo:cristianecheverri/separame:ref:refs/heads/main',
      'repo:cristianecheverri@37417336/separame@1427543331:ref:refs/heads/main',
    ]);
  });
});
