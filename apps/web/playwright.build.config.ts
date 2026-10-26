import { defineConfig } from "@playwright/test";
import config from "./playwright.config";

export default defineConfig({
  ...config,
  webServer: {
    ...config.webServer,
    command: "bun run build && bun run preview --port 18028",
    url: "http://127.0.0.1:18028",
    timeout: 120_000,
    reuseExistingServer: false,
    env: { VITE_APP_ENV: "test", VITE_API_URL: "http://127.0.0.1:18027" },
  },
});
