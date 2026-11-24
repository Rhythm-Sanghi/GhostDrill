import { defineConfig, devices } from '@playwright/test'

const previewBase = '/GhostDrill/'
const previewUrl = `http://127.0.0.1:4173${previewBase}`

export default defineConfig({
  testDir: './tests',
  testMatch: '*.spec.ts',
  use: {
    baseURL: previewUrl,
    channel: process.env.PLAYWRIGHT_CHANNEL,
    reducedMotion: 'reduce',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npm run preview -- --host 127.0.0.1 --port 4173 --strictPort --base ${previewBase}`,
    url: previewUrl,
    reuseExistingServer: false,
  },
})
