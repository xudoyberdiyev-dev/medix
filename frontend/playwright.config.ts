import { defineConfig, devices } from "@playwright/test";

/**
 * E2E (1.8): haqiqiy backend (PostgreSQL bilan) + `next start`. CI'da `e2e` ishi ishga tushiradi;
 * mahalliy: backend :8080 da, `BACKEND_URL=http://localhost:8080 pnpm build && pnpm start`, keyin `pnpm e2e`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "uz-UZ",
    timezoneId: "Asia/Tashkent",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
});
