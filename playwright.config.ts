import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  use: { baseURL: 'http://localhost:3000', trace: 'retain-on-failure' },
  projects: [375, 768, 1440].flatMap(width => [
    { name: `chromium-${width}`, use: { ...devices['Desktop Chrome'], viewport: { width, height: 900 } } },
    { name: `webkit-${width}`, use: { ...devices['Desktop Safari'], viewport: { width, height: 900 } } },
  ]),
})
