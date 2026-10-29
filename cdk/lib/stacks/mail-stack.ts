import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as snsSubscriptions from 'aws-cdk-lib/aws-sns-subscriptions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { HOSTED_ZONE_ID, ROOT_DOMAIN } from '../../../shared/infra';
import { BACKGROUND_FUNCTIONS } from '../../../shared/routes';
import type { StageConfig } from '../config';
import { grantSendEmail, type MailSender } from '../grants';
import { commonEnvironment, createFunction } from '../lambda';

export interface MailStackProps extends cdk.StackProps {
  config: StageConfig;
  /** ses-feedback writes SUPPRESS#<email> items here. */
  table: dynamodb.ITable;
}

/**
 * Outgoing email (SES, us-east-1) for the stage domain — `separame.app` in
 * prod, `dev.separame.app` in dev (its own identity, so dev mail can never hurt
 * prod's reputation):
 *  - Easy DKIM, custom MAIL FROM (`mail.<domain>`, aligned SPF) and DMARC.
 *  - A configuration set with reputation metrics; bounces and complaints go to
 *    SNS → `ses-feedback`, which suppresses the address so we never write to
 *    it again (on top of the account-level suppression list).
 *
 * The SES account is shared with Cartazos and blobhive: bad hygiene here would
 * hurt them too.
 *
 * Inbound (prod only, `config.supportInbox`): mail to soporte@ is received by
 * SES (MX on the apex), stored raw in a private bucket (30 days) and forwarded
 * by `mail-forward` to the operator with Reply-To the sender. SES allows one
 * ACTIVE receipt rule set per region, so the rule is appended to the account's
 * existing one, exactly as Cartazos does.
 */
export class MailStack extends cdk.Stack {
  /** Identity + configuration set ARNs, for scoped `ses:SendEmail` grants. */
  public readonly sender: MailSender;
  public readonly identity: ses.EmailIdentity;
  public readonly configurationSet: ses.ConfigurationSet;

  constructor(scope: Construct, id: string, props: MailStackProps) {
    super(scope, id, props);
    const { config, table } = props;
    const { mailDomain } = config;
    const isApex = mailDomain === ROOT_DOMAIN;
    const mailFromDomain = `mail.${mailDomain}`;

    const zone = route53.PublicHostedZone.fromPublicHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: HOSTED_ZONE_ID,
      zoneName: ROOT_DOMAIN,
    });

    // ── Configuration set + feedback loop ─────────────────────────────────
    this.configurationSet = new ses.ConfigurationSet(this, 'ConfigurationSet', {
      configurationSetName: config.configSetName,
      reputationMetrics: true,
      sendingEnabled: true,
    });

    // Not KMS-encrypted on purpose: SES can't publish to a topic encrypted with
    // the AWS-managed `aws/sns` key, and a customer key costs $1/month.
    const feedbackTopic = new sns.Topic(this, 'FeedbackTopic', {
      topicName: `${config.prefix}-ses-feedback`,
      displayName: 'Separame SES bounces and complaints',
    });
    this.configurationSet.addEventDestination('BouncesAndComplaints', {
      configurationSetEventDestinationName: 'bounces-complaints',
      destination: ses.EventDestination.snsTopic(feedbackTopic),
      events: [ses.EmailSendingEvent.BOUNCE, ses.EmailSendingEvent.COMPLAINT],
    });

    const feedbackFn = createFunction(this, {
      config,
      def: BACKGROUND_FUNCTIONS.sesFeedback,
      environment: commonEnvironment(config, { table }),
    });
    table.grantReadWriteData(feedbackFn);
    feedbackTopic.addSubscription(new snsSubscriptions.LambdaSubscription(feedbackFn));

    // ── Domain identity (DKIM + MAIL FROM) ────────────────────────────────
    // The apex lives at the zone root, so `publicHostedZone` writes the DKIM
    // CNAMEs and the MAIL FROM MX/SPF records itself. A subdomain identity
    // (dev) can't use it — those records are created below in the parent zone.
    this.identity = new ses.EmailIdentity(this, 'Identity', {
      identity: isApex ? ses.Identity.publicHostedZone(zone) : ses.Identity.domain(mailDomain),
      configurationSet: this.configurationSet,
      dkimSigning: true,
      dkimIdentity: ses.DkimIdentity.easyDkim(ses.EasyDkimSigningKeyLength.RSA_2048_BIT),
      mailFromDomain,
      // If the MX is ever missing, fall back to amazonses.com instead of bouncing.
      mailFromBehaviorOnMxFailure: ses.MailFromBehaviorOnMxFailure.USE_DEFAULT_VALUE,
    });

    if (!isApex) {
      this.identity.dkimRecords.forEach((record, index) => {
        new route53.CnameRecord(this, `DkimRecord${index + 1}`, {
          zone,
          // `record.name` is a deploy-time token holding the FULL name
          // (<token>._domainkey.dev.separame.app). CDK can't see that it already
          // ends with the zone, so it would append the zone again; the trailing
          // dot marks it fully qualified.
          recordName: `${record.name}.`,
          domainName: record.value,
        });
      });
      new route53.MxRecord(this, 'MailFromMx', {
        zone,
        recordName: mailFromDomain,
        values: [{ priority: 10, hostName: `feedback-smtp.${this.region}.amazonses.com` }],
      });
      new route53.TxtRecord(this, 'MailFromSpf', {
        zone,
        recordName: mailFromDomain,
        values: ['v=spf1 include:amazonses.com ~all'],
      });
    }

    // DMARC in monitor mode (p=none) while the sending reputation builds up.
    // Once the aggregate reports look clean, move to `p=quarantine`.
    // NOTE: `dmarc@<domain>` has no mailbox yet (no inbound mail), so reports
    // are dropped until an inbound rule exists — harmless for p=none.
    new route53.TxtRecord(this, 'Dmarc', {
      zone,
      recordName: `_dmarc.${mailDomain}`,
      values: [`v=DMARC1; p=none; rua=mailto:dmarc@${mailDomain}`],
    });

    this.sender = {
      identityArn: this.identity.emailIdentityArn,
      configSetArn: this.formatArn({
        service: 'ses',
        resource: 'configuration-set',
        resourceName: this.configurationSet.configurationSetName,
      }),
    };

    if (config.supportInbox) this.supportInbox(config, zone, config.supportInbox);

    new cdk.CfnOutput(this, 'MailFrom', { value: config.mailFrom });
    new cdk.CfnOutput(this, 'ConfigurationSetName', { value: this.configurationSet.configurationSetName });
  }

  private supportInbox(config: StageConfig, zone: route53.IHostedZone, inbox: NonNullable<StageConfig['supportInbox']>): void {
    const bucket = new s3.Bucket(this, 'InboundMail', {
      bucketName: `${config.prefix}-inbound-mail-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      // Ephemeral: the forwarded copy is what matters.
      lifecycleRules: [{ expiration: cdk.Duration.days(30) }],
      removalPolicy: config.removalPolicy,
    });

    const forwarder = createFunction(this, {
      config,
      def: BACKGROUND_FUNCTIONS.mailForward,
      environment: { ...commonEnvironment(config), MAIL_FROM: inbox.address, FORWARD_TO: inbox.forwardTo, SES_CONFIG_SET: config.configSetName },
    });
    bucket.grantRead(forwarder, 'inbox/*');
    grantSendEmail(forwarder, this.sender);
    bucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.LambdaDestination(forwarder), { prefix: 'inbox/' });

    // The apex receives mail at SES (MAIL FROM keeps its own MX on mail.<apex>).
    new route53.MxRecord(this, 'InboundMx', {
      zone,
      values: [{ priority: 10, hostName: `inbound-smtp.${this.region}.amazonaws.com` }],
    });

    ses.ReceiptRuleSet.fromReceiptRuleSetName(this, 'SharedRuleSet', inbox.ruleSetName).addRule('SeparameSupport', {
      recipients: [inbox.address],
      scanEnabled: true,
      tlsPolicy: ses.TlsPolicy.OPTIONAL,
      actions: [new sesActions.S3({ bucket, objectKeyPrefix: 'inbox/' })],
    });

    new cdk.CfnOutput(this, 'SupportAddress', { value: inbox.address });
    new cdk.CfnOutput(this, 'SupportForwardsTo', { value: inbox.forwardTo });
  }
}
