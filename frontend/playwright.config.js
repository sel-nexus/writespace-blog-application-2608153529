/** Launch a local Vite server and exercise real browser-local account flows. */
import { defineConfig } from '@playwright/test';

const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${process.env.E2E_PORT || '5173'}`;
const port = process.env.E2E_PORT || new URL(baseURL).port || '5173';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  use: { baseURL, trace: 'retain-on-failure', browserName: 'chromium' },
  webServer: {
    command: `node node_modules/vite/bin/vite.js --host 0.0.0.0 --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 60000,
  },
});
