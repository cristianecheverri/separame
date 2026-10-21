import { cleanup } from '@testing-library/preact';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  history.replaceState(null, '', '/');
});
