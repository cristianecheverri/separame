import { describe, expect, it } from 'vitest';
import { resourcesOf, templateOf } from './helpers';

describe('WorkersStack', () => {
  const template = templateOf('dev', (s) => s.workers);
  const mappings = resourcesOf(template, 'AWS::Lambda::EventSourceMapping').map(([, r]) => r.Properties);

  const filtersOf = (props: Record<string, unknown>) =>
    ((props.FilterCriteria as { Filters: Array<{ Pattern: string }> }).Filters ?? []).map((f) => JSON.parse(f.Pattern));

  it('consumes the table stream from TRIM_HORIZON with retries, bisection and a DLQ', () => {
    expect(mappings).toHaveLength(2);
    for (const props of mappings) {
      expect(props).toMatchObject({
        StartingPosition: 'TRIM_HORIZON',
        BatchSize: 10,
        BisectBatchOnFunctionError: true,
        MaximumRetryAttempts: 3,
      });
      expect(props.DestinationConfig).toBeDefined();
    }
    template.resourceCountIs('AWS::SQS::Queue', 2);
  });

  it('filters stream-appointments to APPT# / WAIT# items and stream-publish to PROFILE / TEAM / SERVICE# items', () => {
    const patterns = mappings.map(filtersOf);
    expect(patterns).toContainEqual([
      { dynamodb: { Keys: { SK: { S: [{ prefix: 'APPT#' }] } } } },
      { dynamodb: { Keys: { SK: { S: [{ prefix: 'WAIT#' }] } } } },
    ]);
    expect(patterns).toContainEqual([
      { dynamodb: { Keys: { SK: { S: ['PROFILE'] } } } },
      { dynamodb: { Keys: { SK: { S: ['TEAM'] } } } },
      { dynamodb: { Keys: { SK: { S: [{ prefix: 'SERVICE#' }] } } } },
    ]);
  });

  it('lets stream-publish and jobs-tick (landing prices) publish to the site and invalidate it', () => {
    const publishers = resourcesOf(template, 'AWS::IAM::Policy')
      .filter(([, r]) => JSON.stringify(r.Properties.PolicyDocument).includes('cloudfront:CreateInvalidation'))
      .map(([id]) => id)
      .sort();
    expect(publishers).toHaveLength(2);
    expect(publishers[0]).toMatch(/^JobsTick/);
    expect(publishers[1]).toMatch(/^StreamPublish/);
  });

  it('runs jobs-tick every 10 minutes through EventBridge Scheduler', () => {
    template.hasResourceProperties('AWS::Scheduler::Schedule', {
      Name: 'separame-dev-jobs-tick',
      ScheduleExpression: 'rate(10 minutes)',
    });
    template.hasResourceProperties('AWS::Lambda::Function', {
      FunctionName: 'separame-dev-jobs-tick',
      Timeout: 120,
    });
  });
});
