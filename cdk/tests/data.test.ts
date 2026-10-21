import { describe, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';
import { GSI1, GSI2, LSI1, TTL_ATTRIBUTE } from '../../shared/infra';
import { templateOf } from './helpers';

describe('DataStack', () => {
  const template = templateOf('dev', (s) => s.data);

  it('creates the single table with keys, TTL, PITR and a NEW_AND_OLD_IMAGES stream', () => {
    template.resourceCountIs('AWS::DynamoDB::Table', 1);
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'separame-dev',
      BillingMode: 'PAY_PER_REQUEST',
      KeySchema: [
        { AttributeName: 'PK', KeyType: 'HASH' },
        { AttributeName: 'SK', KeyType: 'RANGE' },
      ],
      TimeToLiveSpecification: { AttributeName: TTL_ATTRIBUTE, Enabled: true },
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      StreamSpecification: { StreamViewType: 'NEW_AND_OLD_IMAGES' },
    });
  });

  it('creates GSI1, the sparse reminders GSI2 and LSI1 with the shared names', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: GSI1.name,
          KeySchema: [
            { AttributeName: GSI1.pk, KeyType: 'HASH' },
            { AttributeName: GSI1.sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        }),
        Match.objectLike({
          IndexName: GSI2.name,
          KeySchema: [
            { AttributeName: GSI2.pk, KeyType: 'HASH' },
            { AttributeName: GSI2.sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        }),
      ]),
      LocalSecondaryIndexes: [
        {
          IndexName: LSI1.name,
          KeySchema: [
            { AttributeName: 'PK', KeyType: 'HASH' },
            { AttributeName: LSI1.sk, KeyType: 'RANGE' },
          ],
          Projection: { ProjectionType: 'ALL' },
        },
      ],
    });
  });

  it('enables deletion protection and RETAIN only in prod', () => {
    const dev = templateOf('dev', (s) => s.data);
    const prod = templateOf('prod', (s) => s.data);
    dev.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Delete',
      Properties: Match.objectLike({ DeletionProtectionEnabled: false }),
    });
    prod.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({
        DeletionProtectionEnabled: true,
        PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
      }),
    });
  });
});
