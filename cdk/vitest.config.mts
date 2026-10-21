import { defineConfig } from 'vitest/config';

// CDK assertion tests synthesize the whole app (with bundling disabled), which
// takes a few seconds per stage — hence the generous timeout.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
