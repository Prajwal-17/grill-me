import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Keep browser tests out of the repository's Bun unit-test discovery.
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  workers: 2,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:18028",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    command: "bun run dev --mode test --host 127.0.0.1 --port 18028",
    url: "http://127.0.0.1:18028",
    reuseExistingServer: false,
    env: { VITE_APP_ENV: "test", VITE_API_URL: "http://127.0.0.1:18027" },
  },
});
