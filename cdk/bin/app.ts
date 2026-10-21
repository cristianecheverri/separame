import * as cdk from 'aws-cdk-lib';
import { buildSeparame } from '../lib/separame-app';

/**
 * Sepárame CDK app. One app, two identical stages:
 *
 *   npx cdk deploy --all -c stage=dev                       (local)
 *   npx cdk deploy --all -c stage=prod                      (GitHub Actions on push to main)
 *   npx cdk synth  --all -c stage=dev -c frontendBuild=skip (no frontend builds)
 *   npx cdk deploy SeparameCiCd -c stage=prod -c cicd=true  (once: OIDC deploy role)
 *
 * Stack ids: Separame<Stage><Name> (SeparameDevData, SeparameProdApi, …).
 * Every resource is tagged project=separame, stage=<stage>.
 */
const app = new cdk.App();
buildSeparame(app);
app.synth();
