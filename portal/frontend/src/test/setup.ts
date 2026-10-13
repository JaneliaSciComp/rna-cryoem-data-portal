import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';

// A test's first render of the molecule table takes about 1s on a CI runner, which is
// testing-library's default timeout for `findBy*` and `waitFor`.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
