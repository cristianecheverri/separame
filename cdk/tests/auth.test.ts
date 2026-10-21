import { describe, expect, it } from 'vitest';
import { Match } from 'aws-cdk-lib/assertions';
import { ADMIN_GROUP } from '../../shared/infra';
import { resourcesOf, templateOf } from './helpers';

describe('AuthStack', () => {
  const template = templateOf('dev', (s) => s.auth);

  it('is a Lite email + password pool with SES email and no SMS', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      UserPoolName: 'separame-dev-users',
      UserPoolTier: 'LITE',
      UsernameAttributes: ['email'],
      AutoVerifiedAttributes: ['email'],
      MfaConfiguration: 'OFF',
      AdminCreateUserConfig: { AllowAdminCreateUserOnly: false },
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireLowercase: true,
          RequireNumbers: true,
          RequireUppercase: false,
          RequireSymbols: false,
          TemporaryPasswordValidityDays: 7,
        },
      },
      AccountRecoverySetting: { RecoveryMechanisms: [{ Name: 'verified_email', Priority: 1 }] },
      EmailConfiguration: {
        EmailSendingAccount: 'DEVELOPER',
        ConfigurationSet: 'separame-dev',
        From: Match.stringLikeRegexp('<noreply@dev\\.separame\\.app>$'),
        SourceArn: Match.anyValue(),
      },
    });
    const [[, pool]] = resourcesOf(template, 'AWS::Cognito::UserPool');
    expect(JSON.stringify(pool.Properties.EmailConfiguration)).toContain(':ses:us-east-1:000000000000:identity/dev.separame.app');
    expect(pool.Properties.SmsConfiguration).toBeUndefined();
    expect(JSON.stringify(pool.Properties.Schema)).not.toContain('phone_number');
    expect(JSON.stringify(pool.Properties)).not.toContain('EMAIL_OTP');
  });

  it('wires the PRE_SIGN_UP and CUSTOM_MESSAGE triggers', () => {
    template.hasResourceProperties('AWS::Cognito::UserPool', {
      LambdaConfig: { PreSignUp: Match.anyValue(), CustomMessage: Match.anyValue() },
    });
    for (const name of ['separame-dev-cognito-pre-signup', 'separame-dev-cognito-custom-message']) {
      template.hasResourceProperties('AWS::Lambda::Function', { FunctionName: name });
    }
  });

  it('lets the pre sign-up trigger only PutItem on the table (referral code of the sign-up)', () => {
    const fn = resourcesOf(template, 'AWS::Lambda::Function').find(([, f]) => f.Properties.FunctionName === 'separame-dev-cognito-pre-signup')!;
    expect(JSON.stringify(fn[1].Properties.Environment)).toContain('TABLE_NAME');
    const policies = resourcesOf(template, 'AWS::IAM::Policy').map(([, p]) => JSON.stringify(p.Properties));
    const triggerPolicy = policies.find((p) => p.includes('dynamodb:'));
    expect(triggerPolicy).toBeDefined();
    expect(triggerPolicy).toContain('"dynamodb:PutItem"');
    expect(triggerPolicy).not.toMatch(/dynamodb:(GetItem|Query|DeleteItem|UpdateItem|Scan|\*)/);
  });

  it('has a secretless SRP-only client with revocation and 1 h / 30 d tokens', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolClient', {
      GenerateSecret: false,
      ExplicitAuthFlows: ['ALLOW_USER_SRP_AUTH', 'ALLOW_REFRESH_TOKEN_AUTH'],
      PreventUserExistenceErrors: 'ENABLED',
      EnableTokenRevocation: true,
      IdTokenValidity: 60,
      AccessTokenValidity: 60,
      RefreshTokenValidity: 30 * 24 * 60,
    });
  });

  it('seeds the admin user (emailed invitation, not suppressed) into the admin group', () => {
    template.hasResourceProperties('AWS::Cognito::UserPoolGroup', { GroupName: ADMIN_GROUP });
    template.hasResourceProperties('AWS::Cognito::UserPoolUser', {
      Username: 'crisechevrri@gmail.com',
      DesiredDeliveryMediums: ['EMAIL'],
      UserAttributes: Match.arrayWith([{ Name: 'email_verified', Value: 'true' }]),
    });
    const [[, admin]] = resourcesOf(template, 'AWS::Cognito::UserPoolUser');
    expect(admin.Properties.MessageAction).toBeUndefined();
    template.hasResourceProperties('AWS::Cognito::UserPoolUserToGroupAttachment', {
      Username: 'crisechevrri@gmail.com',
    });
  });

  it('protects the pool from deletion only in prod', () => {
    template.hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Delete',
      Properties: Match.objectLike({ DeletionProtection: 'INACTIVE' }),
    });
    templateOf('prod', (s) => s.auth).hasResource('AWS::Cognito::UserPool', {
      DeletionPolicy: 'Retain',
      Properties: Match.objectLike({ DeletionProtection: 'ACTIVE' }),
    });
  });
});
