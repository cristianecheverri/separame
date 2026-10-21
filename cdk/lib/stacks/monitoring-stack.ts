import * as cdk from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as budgets from 'aws-cdk-lib/aws-budgets';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import { Construct } from 'constructs';
import type { StageConfig } from '../config';
import { STREAM_FUNCTIONS, dlqNameOf } from './workers-stack';

export interface MonitoringStackProps extends cdk.StackProps {
  config: StageConfig;
  /** Project budget (USD/month), prod only. */
  monthlyBudgetUsd?: number;
}

/** CloudWatch: an alarm's metric math can reference at most 10 metrics. */
export const MAX_METRICS_PER_ALARM = 10;

/**
 * Metric math SUM of several metrics as one time series. FILL(…, 0) keeps a
 * queue with no datapoints from blanking the whole sum.
 */
function sumOf(metrics: cloudwatch.IMetric[], label: string, period: cdk.Duration): cloudwatch.MathExpression {
  if (metrics.length > MAX_METRICS_PER_ALARM) {
    throw new Error(`An alarm can read at most ${MAX_METRICS_PER_ALARM} metrics (got ${metrics.length}: ${label}).`);
  }
  const usingMetrics = Object.fromEntries(metrics.map((metric, i) => [`m${i}`, metric]));
  const terms = Object.keys(usingMetrics).map((id) => `FILL(${id}, 0)`);
  return new cloudwatch.MathExpression({ expression: `SUM([${terms.join(', ')}])`, usingMetrics, label, period });
}

/**
 * Sepárame's own monitoring — deliberately minimal, because the account-wide
 * alarms in Cartazos' CardsMonitoringStack already cover every Lambda in the
 * account (errors and throttles, no dimension) and SES bounce/complaint
 * rates. That stack also owns the single account budget. Don't duplicate any
 * of those here.
 *
 * prod only (dev is a testing stage: it stays empty — its failures still
 * show in the DLQ console and in the account-wide Lambda errors alarm):
 *  - messages parked in either stream DLQ (> 0) — a failed stream batch is
 *    otherwise silent once its retries are exhausted;
 *  - a project budget filtered by the `Project=separame` cost-allocation tag.
 * The stack exists in both stages so their stack lists stay identical.
 *
 * DLQs are referenced by their deterministic names (no cross-stack exports).
 * Cost: 2 alarm metrics, inside the account's 10 free ones (the sibling
 * projects use 5).
 */
export class MonitoringStack extends cdk.Stack {
  public readonly alarms: cloudwatch.Alarm[] = [];

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config } = props;
    if (config.stage !== 'prod') return;

    // Not KMS-encrypted: CloudWatch alarms can't publish to a topic encrypted
    // with the AWS-managed `aws/sns` key (and a customer key costs $1/month).
    const topic = new sns.Topic(this, 'AlertsTopic', {
      topicName: `${config.prefix}-alerts`,
      displayName: `Separame ${config.stage} alerts`,
    });
    topic.addSubscription(new snsSubscriptions.EmailSubscription(config.alertEmail));

    // ── Stream DLQs: any parked batch needs a look ────────────────────────
    const fiveMinutes = cdk.Duration.minutes(5);
    const queueNames = STREAM_FUNCTIONS.map((def) => dlqNameOf(config, def));
    const dlqAlarm = new cloudwatch.Alarm(this, 'DlqMessages', {
      alarmName: `${config.prefix}-dlq-messages`,
      alarmDescription: `Failed stream batches waiting in: ${queueNames.join(', ')}`,
      metric: sumOf(
        queueNames.map(
          (queueName) =>
            new cloudwatch.Metric({
              namespace: 'AWS/SQS',
              metricName: 'ApproximateNumberOfMessagesVisible',
              dimensionsMap: { QueueName: queueName },
              statistic: cloudwatch.Stats.MAXIMUM,
              period: fiveMinutes,
            }),
        ),
        'DLQ messages',
        fiveMinutes,
      ),
      threshold: 0,
      comparisonOperator: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    dlqAlarm.addAlarmAction(new cwActions.SnsAction(topic));
    this.alarms.push(dlqAlarm);

    // ── Project budget (tag-filtered; NOT the account budget) ─────────────
    // Filters on the `Project` cost-allocation tag (already active in Billing
    // for this account, shared with Cartazos). Credits excluded so the budget
    // still means something while they last.
    const subscribers = [{ subscriptionType: 'EMAIL', address: config.alertEmail }];
    new budgets.CfnBudget(this, 'ProjectBudget', {
      budget: {
        budgetName: 'separame-monthly',
        budgetType: 'COST',
        timeUnit: 'MONTHLY',
        budgetLimit: { amount: props.monthlyBudgetUsd ?? 5, unit: 'USD' },
        costFilters: { TagKeyValue: ['user:Project$separame'] },
        costTypes: { includeCredit: false, includeRefund: false },
      },
      notificationsWithSubscribers: [
        {
          notification: {
            notificationType: 'ACTUAL',
            comparisonOperator: 'GREATER_THAN',
            threshold: 80,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
        {
          notification: {
            notificationType: 'FORECASTED',
            comparisonOperator: 'GREATER_THAN',
            threshold: 100,
            thresholdType: 'PERCENTAGE',
          },
          subscribers,
        },
      ],
    });
  }
}
