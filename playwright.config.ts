import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.E2E_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './test/e2e',
  timeout: 45_000,
  workers: 2,
  webServer: {
    command: 'pnpm dev:all',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [375, 768, 1440].flatMap(width => [
    { name: `chromium-${width}`, use: { ...devices['Desktop Chrome'], viewport: { width, height: 900 } } },
    { name: `webkit-${width}`, use: { ...devices['Desktop Safari'], viewport: { width, height: 900 } } },
  ]),
})
