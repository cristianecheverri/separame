import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

/**
 * One flat ESLint config for the whole monorepo. Type-unaware (no project
 * service) so it stays fast in CI; `tsc` already does the type checking.
 *   - backend / cdk / shared          → Node globals
 *   - frontend/app, frontend/booking  → browser globals + react-hooks rules
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/dev-dist/**',
      '**/cdk.out/**',
      '**/node_modules/**',
      'mockups/**',
      '**/*.config.{js,cjs,mjs,ts}',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['backend/**/*.ts', 'cdk/**/*.ts', 'shared/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    files: ['frontend/app/src/**/*.{ts,tsx}', 'frontend/booking/src/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
);
