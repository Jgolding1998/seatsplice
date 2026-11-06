import { defineConfig } from '@playwright/test';

const url = 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './tests',
  testMatch: 'browser.spec.js',
  workers: 1,
  timeout: 30000,
  use: { baseURL: url, trace: 'retain-on-failure', channel: process.env.PLAYWRIGHT_CHANNEL },
  webServer: {
    command: 'node server/demo.js --seed',
    env: { PORT: '4174' },
    url: url + '/api/health',
    timeout: 60000,
    reuseExistingServer: false
  }
});
