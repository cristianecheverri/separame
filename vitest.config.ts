import { defineConfig } from 'vitest/config';

// Unit tests for the pure shared logic and the backend (handlers + services).
// The frontends and the CDK app run their own vitest configs.
export default defineConfig({
  test: {
    include: ['shared/**/*.test.ts', 'backend/**/*.test.ts'],
    environment: 'node',
  },
});
