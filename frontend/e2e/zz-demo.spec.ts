import { test, expect, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";

/**
 * Egasiga ko'rsatish uchun skrinshotlar (faqat «Demo skrinshotlar» workflow'ida, DEMO_SHOTS=1).
 * first-run.spec.ts yaratgan ma'lumotlar ustida CEO bilan asosiy sahifalarni suratga oladi.
 */
const OUT = process.env.DEMO_SHOTS_DIR ?? "/tmp/demo";
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

const pages: [string, string][] = [
  ["/", "01-bosh-sahifa"],
  ["/orders", "02-buyurtmalar"],
  ["/receipts", "03-kirim"],
  ["/stock", "04-qoldiqlar"],
  ["/expiry", "05-muddat"],
  ["/products", "06-mahsulotlar"],
  ["/prices", "07-narxlar"],
  ["/customers", "08-mijozlar"],
  ["/warehouse", "09-ombor-monitori"],
  ["/payments", "10-tolovlar"],
  ["/cash", "11-kassa"],
  ["/debts", "12-qarzlar"],
  ["/reports", "13-hisobotlar"],
  ["/settings", "14-sozlamalar"],
];

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 60 });
}

test.describe("demo skrinshotlar", () => {
  test.skip(!process.env.DEMO_SHOTS, "faqat demo workflow'ida");

  test("asosiy sahifalar", async ({ page }) => {
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await page.goto("/login");
    await shot(page, "00-login");
    await page.getByLabel("Login", { exact: true }).fill(CEO_LOGIN);
    await page.getByLabel("Parol", { exact: true }).fill(CEO_PASSWORD);
    await page.getByRole("button", { name: /kirish/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    for (const [path, name] of pages) {
      await page.goto(path).catch(() => undefined);
      await shot(page, name);
    }
  });
});
