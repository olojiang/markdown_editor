import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/electron',
  timeout: 30_000,
  reporter: [['list']],
  use: {
    trace: 'retain-on-failure',
  },
});
