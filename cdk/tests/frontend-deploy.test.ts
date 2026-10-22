import { describe, expect, it } from 'vitest';
import { resourcesOf, synthStage, templateOf } from './helpers';

type Deployment = { Properties: Record<string, unknown> };

describe('FrontendDeployStack', () => {
  const template = templateOf('dev', (s) => s.frontendDeploy);
  const deployments = resourcesOf(template, 'Custom::CDKBucketDeployment').map(([id, r]) => [id, r as Deployment] as const);
  const byId = (prefix: string) => deployments.find(([id]) => id.startsWith(prefix))![1].Properties;

  it('never prunes the bucket root (profile pages live there)', () => {
    expect(deployments).toHaveLength(4);
    for (const [, d] of deployments) {
      if (!d.Properties.DestinationBucketKeyPrefix) expect(d.Properties.Prune).toBe(false);
    }
    expect(byId('BookingDeployment').Prune).toBe(false);
    // index.html, 404.html, c/index.html, w/index.html placeholders + robots.txt.
    expect((byId('BookingDeployment').SourceObjectKeys as unknown[]).length).toBe(5);
  });

  it('deploys the SPA under app/ (pruned within the prefix) with config.json', () => {
    const app = byId('AppDeployment');
    expect(app.DestinationBucketKeyPrefix).toBe('app/');
    expect(app.Prune).toBe(true);
    expect((app.SourceObjectKeys as unknown[]).length).toBe(2); // build + config.json
  });

  it('stamps no-cache on shells and immutable on hashed assets, then invalidates /*', () => {
    expect(byId('BookingDeployment').SystemMetadata).toEqual({ 'cache-control': 'no-cache' });
    expect(byId('AppDeployment').SystemMetadata).toEqual({ 'cache-control': 'no-cache' });
    const immutable = { 'cache-control': 'public, max-age=31536000, immutable' };
    expect(byId('BookingAssetsImmutable')).toMatchObject({ SystemMetadata: immutable, Include: ['b/assets/*'] });
    expect(byId('AppAssetsImmutable')).toMatchObject({
      SystemMetadata: immutable,
      Include: ['assets/*'],
      DistributionPaths: ['/*'],
    });
  });

  it('deploys after the API', () => {
    const { frontendDeploy, api } = synthStage('dev');
    expect(frontendDeploy.dependencies).toContain(api);
  });
});
