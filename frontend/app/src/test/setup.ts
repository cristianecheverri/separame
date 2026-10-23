import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// The full-app flows (lazy routes + mock API) take ~1 s; under a loaded machine or CI the default
// 1 s `findBy`/`waitFor` budget made them flaky.
configure({ asyncUtilTimeout: 3000 });

afterEach(() => cleanup());
