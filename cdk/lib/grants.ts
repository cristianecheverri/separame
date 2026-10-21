import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import type * as s3 from 'aws-cdk-lib/aws-s3';
import type * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type { StageConfig } from './config';

/**
 * Small, reusable least-privilege grants shared by the API and workers stacks.
 */

/** What a stack needs to let a function send email through the stage's SES identity. */
export interface MailSender {
  identityArn: string;
  configSetArn: string;
}

/**
 * `ses:SendEmail` / `ses:SendRawEmail`, scoped to the stage identity and its
 * configuration set (SES authorizes both resources on every send). Nothing
 * else in the shared account (Cartazos, blobhive) can be used as a sender.
 */
export function grantSendEmail(grantee: iam.IGrantable, mail: MailSender): void {
  iam.Grant.addToPrincipal({
    grantee,
    actions: ['ses:SendEmail', 'ses:SendRawEmail'],
    resourceArns: [mail.identityArn, mail.configSetArn],
  });
}

/**
 * Read the stage secrets (`/separame/<stage>/*`). SecureStrings use the
 * AWS-managed `aws/ssm` key, whose key policy already allows decryption via
 * SSM for principals of this account — no KMS statement needed.
 */
export function grantReadStageParameters(grantee: iam.IGrantable, config: StageConfig, stack: cdk.Stack): void {
  iam.Grant.addToPrincipal({
    grantee,
    actions: ['ssm:GetParameter', 'ssm:GetParameters', 'ssm:GetParametersByPath'],
    resourceArns: [
      stack.formatArn({
        service: 'ssm',
        resource: 'parameter',
        // formatArn joins with '/', and the prefix already starts with one.
        resourceName: `${config.ssmPrefix.replace(/^\//, '')}/*`,
      }),
    ],
  });
}

/**
 * Publish / delete static pages on the site bucket and invalidate them on the
 * distribution (stream-publish regenerates /<slug>, pro-account removes the
 * old slug's page). Reading is needed for the booking HTML template.
 */
export function grantSitePublishing(
  grantee: iam.IGrantable,
  bucket: s3.IBucket,
  distribution: cloudfront.IDistribution,
): void {
  bucket.grantReadWrite(grantee); // includes s3:DeleteObject*
  distribution.grantCreateInvalidation(grantee);
}
