import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import type { Stage } from '../lib/config';
import { buildSeparame, type SeparameStacks } from '../lib/separame-app';

export const TEST_ACCOUNT = '000000000000';

const cache = new Map<string, SeparameStacks>();

/**
 * Builds the whole app for a stage with placeholder frontends and bundling
 * disabled (no esbuild, no npm), memoized per stage + extra context.
 */
export function synthStage(stage: Stage, extraContext: Record<string, string> = {}): SeparameStacks {
  const key = JSON.stringify({ stage, extraContext });
  const cached = cache.get(key);
  if (cached) return cached;
  const app = new cdk.App({
    context: {
      stage,
      frontendBuild: 'skip',
      'aws:cdk:bundling-stacks': [],
      ...extraContext,
    },
  });
  const stacks = buildSeparame(app, TEST_ACCOUNT);
  cache.set(key, stacks);
  return stacks;
}

export function templateOf(stage: Stage, pick: (stacks: SeparameStacks) => cdk.Stack): Template {
  return Template.fromStack(pick(synthStage(stage)));
}

/** Resources of a type as [logicalId, resource] pairs. */
export function resourcesOf(template: Template, type: string): Array<[string, { Properties: Record<string, unknown> }]> {
  return Object.entries(template.findResources(type)) as Array<[string, { Properties: Record<string, unknown> }]>;
}
