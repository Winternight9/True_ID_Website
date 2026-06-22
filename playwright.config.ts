import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './tests',
  timeout: 60_000,
  retries: 1,
  workers: 2,
  reporter: [
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['json', { outputFile: 'test-results/results.json' }],
    ['list'],
    // 'github' reporter: ขึ้น annotation บนหน้า Actions log โดยตรงเมื่อรันบน CI
    ...(process.env.CI ? ([['github']] as const) : []),
  ],
  use: {
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'on',
    trace: process.env.CI ? 'on' : 'retain-on-failure',
    locale: 'th-TH',
    timezoneId: 'Asia/Bangkok',
    extraHTTPHeaders: {
      'Accept-Language': 'th-TH,th;q=0.9,en;q=0.8',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  outputDir: path.resolve('test-results'),
});
