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
  // P2: koʻp rolli zanjir testlari (3–5 kirish + hujjatlar) CI runnerʼda 60 s ga yaqinlashadi — 18.11 dagi «beqaror» yiqilishlar
  // (roles-chain «reysga chiqadi», o16 «3 dona → yigʻish») aynan test byudjeti tugashi edi (1.0m), mantiq xatosi emas.
  timeout: 120_000,
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
