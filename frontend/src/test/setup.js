/** Isolate DOM and browser storage, restoring descriptors and spies after every test. */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

const storageDescriptor = Object.getOwnPropertyDescriptor(window, 'localStorage');

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  window.localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(window, 'localStorage', storageDescriptor);
  window.localStorage.clear();
});
