import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as scheduler from 'aws-cdk-lib/aws-scheduler';
import * as schedulerTargets from 'aws-cdk-lib/aws-scheduler-targets';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import type * as lambdaNode from 'aws-cdk-lib/aws-lambda-nodejs';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { BACKGROUND_FUNCTIONS, type FunctionDef } from '../../../shared/routes';
import type { StageConfig } from '../config';
import { grantReadStageParameters, grantSendEmail, grantSitePublishing, type MailSender } from '../grants';
import { commonEnvironment, constructIdOf, createFunction, functionNameOf } from '../lambda';

export interface WorkersStackProps extends cdk.StackProps {
  config: StageConfig;
  table: dynamodb.ITable;
  siteBucket: s3.IBucket;
  distribution: cloudfront.IDistribution;
  mail: MailSender;
}

/** `separame-<stage>-<fn>-dlq` — MonitoringStack alarms on these names. */
export function dlqNameOf(config: Pick<StageConfig, 'prefix'>, def: Pick<FunctionDef, 'name'>): string {
  return `${functionNameOf(config, def)}-dlq`;
}

/** Background functions with a stream DLQ (MonitoringStack alarms on each). */
export const STREAM_FUNCTIONS: readonly FunctionDef[] = [
  BACKGROUND_FUNCTIONS.streamEmails,
  BACKGROUND_FUNCTIONS.streamPublish,
];

/**
 * Asynchronous work, off the request path:
 *  - stream-emails:  DynamoDB stream → appointment emails (confirmation,
 *    change, cancellation, notice to the professional). The event filter wakes
 *    it only for `APPT#` items.
 *  - stream-publish: DynamoDB stream → regenerates the static `/<slug>` page
 *    when the profile or a service changes.
 *  - jobs-tick:      ONE EventBridge Scheduler schedule every 10 minutes (24 h
 *    reminders from the sparse GSI2, renewal notices, price migrations) —
 *    never one schedule per appointment.
 *
 * Stream consumers retry, bisect poison batches and finally park them in an
 * SQS DLQ (alarmed in MonitoringStack). Handlers must be idempotent.
 */
export class WorkersStack extends cdk.Stack {
  public readonly functions: lambdaNode.NodejsFunction[];

  constructor(scope: Construct, id: string, props: WorkersStackProps) {
    super(scope, id, props);
    const { config, table, siteBucket, distribution, mail } = props;
    const environment = commonEnvironment(config, { table, siteBucket, distribution });

    // ── Appointment emails ────────────────────────────────────────────────
    const streamEmails = createFunction(this, { config, def: BACKGROUND_FUNCTIONS.streamEmails, environment });
    table.grantReadWriteData(streamEmails); // EMAIL# idempotency markers, SUPPRESS# lookups
    grantSendEmail(streamEmails, mail);
    grantReadStageParameters(streamEmails, config, this); // link signing secret
    streamEmails.addEventSource(
      this.streamSource(config, table, BACKGROUND_FUNCTIONS.streamEmails, [
        lambda.FilterCriteria.filter({ dynamodb: { Keys: { SK: { S: lambda.FilterRule.beginsWith('APPT#') } } } }),
      ]),
    );

    // ── Profile page publishing ───────────────────────────────────────────
    const streamPublish = createFunction(this, { config, def: BACKGROUND_FUNCTIONS.streamPublish, environment });
    table.grantReadData(streamPublish); // profile + services of the changed pro
    grantSitePublishing(streamPublish, siteBucket, distribution); // template read, page write, invalidation
    // Filters are ORed: the PROFILE item, or any SERVICE#<id> item.
    streamPublish.addEventSource(
      this.streamSource(config, table, BACKGROUND_FUNCTIONS.streamPublish, [
        lambda.FilterCriteria.filter({ dynamodb: { Keys: { SK: { S: lambda.FilterRule.isEqual('PROFILE') } } } }),
        lambda.FilterCriteria.filter({ dynamodb: { Keys: { SK: { S: lambda.FilterRule.beginsWith('SERVICE#') } } } }),
      ]),
    );

    // ── Scheduled jobs ────────────────────────────────────────────────────
    const jobsTick = createFunction(this, { config, def: BACKGROUND_FUNCTIONS.jobsTick, environment });
    table.grantReadWriteData(jobsTick);
    grantSendEmail(jobsTick, mail);
    grantReadStageParameters(jobsTick, config, this);
    new scheduler.Schedule(this, 'JobsTickSchedule', {
      scheduleName: `${config.prefix}-jobs-tick`,
      description: 'Reminders, renewal notices and price migrations',
      schedule: scheduler.ScheduleExpression.rate(cdk.Duration.minutes(10)),
      // A missed tick is caught up by the next one; don't pile up retries.
      target: new schedulerTargets.LambdaInvoke(jobsTick, { retryAttempts: 0 }),
    });

    this.functions = [streamEmails, streamPublish, jobsTick];
  }

  /** TRIM_HORIZON stream mapping with retries, bisection and an SQS DLQ. */
  private streamSource(
    config: StageConfig,
    table: dynamodb.ITable,
    def: FunctionDef,
    filters: Array<Record<string, unknown>>,
  ): lambdaEventSources.DynamoEventSource {
    const dlq = new sqs.Queue(this, `${constructIdOf(def.name)}Dlq`, {
      queueName: dlqNameOf(config, def),
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      retentionPeriod: cdk.Duration.days(14),
      enforceSSL: true,
    });
    return new lambdaEventSources.DynamoEventSource(table, {
      startingPosition: lambda.StartingPosition.TRIM_HORIZON,
      batchSize: 10,
      bisectBatchOnError: true,
      retryAttempts: 3,
      // Handlers may return { batchItemFailures } to retry only failed records.
      reportBatchItemFailures: true,
      onFailure: new lambdaEventSources.SqsDlq(dlq),
      filters,
    });
  }
}
