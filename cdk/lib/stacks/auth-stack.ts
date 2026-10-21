import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import type * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { ADMIN_GROUP } from '../../../shared/infra';
import { BACKGROUND_FUNCTIONS } from '../../../shared/routes';
import type { StageConfig } from '../config';
import { commonEnvironment, createFunction } from '../lambda';

export interface AuthStackProps extends cdk.StackProps {
  config: StageConfig;
  /** The pre sign-up trigger remembers the sign-up's referral code (PutItem only). */
  table: dynamodb.ITable;
}

/**
 * Professionals and the admin: one Cognito User Pool per stage (Lite plan —
 * free up to 10k MAU).
 *  - Email + password, through SRP only (the panel uses Amplify Auth; the
 *    plaintext USER_PASSWORD flow stays off). Self sign-up confirms the email
 *    with a code; forgotten passwords are reset by an emailed code.
 *  - NIST-style password policy: length over complexity.
 *  - Email only: no phone attribute, no SMS, no SMS MFA, email-only recovery.
 *  - Mail goes through SES (`noreply@<mailDomain>` + the stage configuration
 *    set) — Cognito's built-in sender has a tiny daily cap. The SES identity
 *    must exist (and be verified) first, hence the dependency on MailStack.
 *  - Triggers: PRE_SIGN_UP rejects disposable email domains and remembers the
 *    referral code sent as clientMetadata (`REFSIGNUP#` item, PutItem only); CUSTOM_MESSAGE
 *    brands every Cognito email (sign-up code, password reset, admin
 *    invitation). They live here (not in the API stack) to avoid a circular
 *    reference between the pool and its functions.
 *  - The admin is a regular user in the `admin` group, seeded by CDK: Cognito
 *    emails an invitation with a temporary password, and the panel asks for a
 *    new password on first sign-in.
 */
export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config, table } = props;

    // Triggers can't receive USER_POOL_ID (circular): it comes in the event.
    const triggerEnv = commonEnvironment(config);
    const preSignUp = createFunction(this, {
      config,
      def: BACKGROUND_FUNCTIONS.cognitoPreSignUp,
      environment: commonEnvironment(config, { table }),
    });
    // Least privilege: it only writes the sign-up's referral code marker.
    preSignUp.addToRolePolicy(new iam.PolicyStatement({ actions: ['dynamodb:PutItem'], resources: [table.tableArn] }));
    const customMessage = createFunction(this, {
      config,
      def: BACKGROUND_FUNCTIONS.cognitoCustomMessage,
      environment: triggerEnv,
    });

    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `${config.prefix}-users`,
      featurePlan: cognito.FeaturePlan.LITE,
      selfSignUpEnabled: true,
      // Email is the username (Cognito stores a generated `sub` internally).
      signInAliases: { email: true },
      signInCaseSensitive: false,
      autoVerify: { email: true },
      // Email can change later only once the new address is verified.
      standardAttributes: { email: { required: true, mutable: true } },
      keepOriginal: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireDigits: true,
        requireUppercase: false,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      // Spanish defaults; the CUSTOM_MESSAGE trigger replaces them with the
      // branded HTML versions.
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: 'Tu código de verificación de Sepárame',
        emailBody: 'Tu código de verificación es {####}',
      },
      userInvitation: {
        emailSubject: 'Tu cuenta en Sepárame',
        emailBody: 'Hola. Tu usuario es {username} y tu contraseña temporal es {####}. Al entrar te pediremos una nueva.',
      },
      mfa: cognito.Mfa.OFF,
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      email: cognito.UserPoolEmail.withSES({
        fromEmail: config.mailFromAddress,
        fromName: 'Sepárame',
        sesRegion: config.region,
        sesVerifiedDomain: config.mailDomain,
        configurationSetName: config.configSetName,
      }),
      lambdaTriggers: { preSignUp, customMessage },
      deletionProtection: config.retain,
      removalPolicy: config.removalPolicy,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `${config.prefix}-web`,
      generateSecret: false,
      // SRP only (refresh-token auth is always on); never the plaintext
      // USER_PASSWORD flow, and no choice-based USER_AUTH.
      authFlows: { userSrp: true, user: false, userPassword: false },
      // No hosted UI / OAuth: the SPAs talk to the Cognito API directly.
      disableOAuth: true,
      preventUserExistenceErrors: true,
      idTokenValidity: cdk.Duration.hours(1),
      accessTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
    });

    // ── Admin ─────────────────────────────────────────────────────────────
    const adminGroup = new cognito.UserPoolGroup(this, 'AdminGroup', {
      userPool: this.userPool,
      groupName: ADMIN_GROUP,
      description: 'Sepárame administrators (subscriptions, prices, manual payments)',
    });

    // Cognito emails the invitation with a temporary password (valid 7 days;
    // resend with `admin-create-user --message-action RESEND`). Both triggers
    // run for it: PreSignUp_AdminCreateUser and CustomMessage_AdminCreateUser.
    const adminUser = new cognito.CfnUserPoolUser(this, 'AdminUser', {
      userPoolId: this.userPool.userPoolId,
      username: config.adminEmail,
      desiredDeliveryMediums: ['EMAIL'],
      userAttributes: [
        { name: 'email', value: config.adminEmail },
        { name: 'email_verified', value: 'true' },
      ],
    });
    adminUser.applyRemovalPolicy(config.removalPolicy);

    const membership = new cognito.CfnUserPoolUserToGroupAttachment(this, 'AdminMembership', {
      userPoolId: this.userPool.userPoolId,
      groupName: adminGroup.groupName,
      username: config.adminEmail,
    });
    membership.addResourceDependency(adminUser);
    membership.node.addDependency(adminGroup);

    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClient.userPoolClientId });
  }
}
