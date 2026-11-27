import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 30000,
  workers: 1,
  outputDir: 'artifacts/ui-results',
  reporter: 'list',
  use: {
    baseURL: 'http://favonly.test',
    viewport: { width: 390, height: 844 },
    browserName: 'chromium',
    channel: 'msedge',
    screenshot: 'only-on-failure',
  },
});
