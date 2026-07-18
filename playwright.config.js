// @ts-check
const { defineConfig, devices } = require("@playwright/test");

const port = Number(process.env.E2E_PORT || 4180);
const baseURL = process.env.E2E_BASE_URL || `http://127.0.0.1:${port}`;

module.exports = defineConfig({
  testDir: "./e2e/tests",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 180000,
  expect: { timeout: 30000 },
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
    ["./e2e/reporters/failure-detail-reporter.js"],
  ],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 30000,
    navigationTimeout: 60000,
  },
  projects: [
    {
      name: "desktop-chrome",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 900 },
      },
    },
    {
      name: "mobile-iphone",
      grep: /@core/,
      use: {
        ...devices["iPhone 13"],
        viewport: { width: 390, height: 844 },
      },
    },
    {
      name: "mobile-android",
      grep: /@core/,
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 412, height: 915 },
      },
    },
  ],
  webServer: {
    command: "node e2e/scripts/start-test-server.js",
    url: `${baseURL}/index.html`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
