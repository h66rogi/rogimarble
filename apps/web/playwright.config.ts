import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./browser",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  use: {
    baseURL: "http://127.0.0.1:3417",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    bypassCSP: !process.env.CONSOLE_BROWSER_PRODUCTION,
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: process.env.CONSOLE_BROWSER_PRODUCTION
      ? "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 -p 3417"
      : "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 -p 3417",
    url: "http://127.0.0.1:3417/login",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
