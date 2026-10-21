import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export interface CiCdStackProps extends cdk.StackProps {
  /** GitHub `owner/repo`. */
  repository: string;
  /** Branches allowed to deploy. Defaults to `main`. */
  branches?: string[];
}

/**
 * IAM role so GitHub Actions can deploy prod without static keys. Account-wide
 * (not per stage) and deployed once, by hand:
 *
 *   cd cdk && npx cdk deploy SeparameCiCd -c stage=prod -c cicd=true
 *
 * Then copy the `GithubDeployRoleArn` output into the repo secret
 * `AWS_DEPLOY_ROLE_ARN`; `.github/workflows/deploy.yml` assumes it on every
 * push to main.
 */
export class CiCdStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: CiCdStackProps) {
    super(scope, id, props);
    const branches = props.branches ?? ['main'];

    // The GitHub OIDC provider is account-global (one per URL) and already
    // exists in this account (created by a sibling project), so it's imported.
    const provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidcProvider',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    // Trust only tokens whose `sub` is this repo on an allowed branch.
    const role = new iam.Role(this, 'GithubDeployRole', {
      roleName: 'SeparameGithubDeployRole',
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: { 'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com' },
        StringLike: {
          'token.actions.githubusercontent.com:sub': branches.map((b) => `repo:${props.repository}:ref:refs/heads/${b}`),
        },
      }),
      description: 'Assumed by GitHub Actions (separame repo) to run cdk deploy',
      maxSessionDuration: cdk.Duration.hours(1),
    });

    // Least privilege: `cdk deploy` does all resource work by assuming the
    // bootstrap `cdk-*` roles (deploy, file/image publishing, lookup), so this
    // role only needs to assume those — no AdministratorAccess.
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [`arn:aws:iam::${this.account}:role/cdk-*`],
      }),
    );

    new cdk.CfnOutput(this, 'GithubDeployRoleArn', {
      value: role.roleArn,
      description: 'Copy this ARN into the repo secret AWS_DEPLOY_ROLE_ARN',
    });
  }
}
