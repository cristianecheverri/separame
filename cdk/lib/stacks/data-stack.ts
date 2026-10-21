import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { GSI1, GSI2, LSI1, TABLE_KEYS, TTL_ATTRIBUTE } from '../../../shared/infra';
import type { StageConfig } from '../config';

export interface DataStackProps extends cdk.StackProps {
  config: StageConfig;
}

/**
 * Persistence: one DynamoDB single table per stage (`separame-<stage>`). The
 * full item layout is documented in shared/infra.ts.
 *
 *   GSI1 (gsi1):           admin listings — subscriptions ordered by graceUntil.
 *   GSI2 (gsi2-reminders): sparse — appointments whose 24 h reminder is pending,
 *                          bucketed per Bogotá day (read by jobs-tick).
 *   LSI1 (lsi1-start):     a professional's appointments ordered by start.
 *
 * On-demand billing (zero cost at rest), PITR in both stages (cents with a few
 * MB of data), TTL only on ephemeral items, and a NEW_AND_OLD_IMAGES stream
 * that feeds the appointment-email and page-publishing workers.
 */
export class DataStack extends cdk.Stack {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: config.prefix,
      partitionKey: { name: TABLE_KEYS.pk, type: dynamodb.AttributeType.STRING },
      sortKey: { name: TABLE_KEYS.sk, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      deletionProtection: config.retain,
      removalPolicy: config.removalPolicy,
      // Epoch seconds; set ONLY on ephemeral items (email idempotency
      // markers, rate-limit counters) — never on records that must live as long
      // as their parent.
      timeToLiveAttribute: TTL_ATTRIBUTE,
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
    });

    this.table.addGlobalSecondaryIndex({
      indexName: GSI1.name,
      partitionKey: { name: GSI1.pk, type: dynamodb.AttributeType.STRING },
      sortKey: { name: GSI1.sk, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Sparse: the attributes are removed (conditionally) once the reminder is sent.
    this.table.addGlobalSecondaryIndex({
      indexName: GSI2.name,
      partitionKey: { name: GSI2.pk, type: dynamodb.AttributeType.STRING },
      sortKey: { name: GSI2.sk, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // LSIs can only be created with the table (they share its partition key).
    this.table.addLocalSecondaryIndex({
      indexName: LSI1.name,
      sortKey: { name: LSI1.sk, type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    new cdk.CfnOutput(this, 'TableName', { value: this.table.tableName });
  }
}
