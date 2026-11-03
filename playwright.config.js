import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:5173',
    permissions: ['camera'],
    serviceWorkers: 'block',
    viewport: { width: 390, height: 844 },
    launchOptions: {
      args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
    },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: { command: 'npm run serve', url: 'http://localhost:5173', reuseExistingServer: true },
});
