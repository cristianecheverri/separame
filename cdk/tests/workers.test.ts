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

  it('filters stream-emails to APPT# items and stream-publish to PROFILE / SERVICE# items', () => {
    const patterns = mappings.map(filtersOf);
    expect(patterns).toContainEqual([{ dynamodb: { Keys: { SK: { S: [{ prefix: 'APPT#' }] } } } }]);
    expect(patterns).toContainEqual([
      { dynamodb: { Keys: { SK: { S: ['PROFILE'] } } } },
      { dynamodb: { Keys: { SK: { S: [{ prefix: 'SERVICE#' }] } } } },
    ]);
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
