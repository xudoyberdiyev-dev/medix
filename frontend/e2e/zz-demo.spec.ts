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
  ["/orders", "02-orders"],
  ["/orders/new", "03-orders-new"],
  ["/approvals", "04-approvals"],
  ["/shipments", "05-shipments"],
  ["/receipts", "06-receipts"],
  ["/receipts/new", "07-receipts-new"],
  ["/stock", "08-stock"],
  ["/expiry", "09-expiry"],
  ["/transfers", "10-transfers"],
  ["/warehouse-transfers", "11-warehouse-transfers"],
  ["/zone-transfers", "12-zone-transfers"],
  ["/inventory-counts", "13-inventory-counts"],
  ["/inventory-counts/new", "14-inventory-counts-new"],
  ["/customer-returns", "15-customer-returns"],
  ["/write-offs", "16-write-offs"],
  ["/supplier-returns", "17-supplier-returns"],
  ["/opening", "18-opening"],
  ["/payments", "19-payments"],
  ["/payments/mt/new", "20-payments-mt-new"],
  ["/cash", "21-cash"],
  ["/cash/close", "22-cash-close"],
  ["/cash/ops/new", "23-cash-ops-new"],
  ["/bank", "24-bank"],
  ["/debts/customers", "25-debts-customers"],
  ["/debts/suppliers", "26-debts-suppliers"],
  ["/bonuses", "27-bonuses"],
  ["/reconciliations", "28-reconciliations"],
  ["/reconciliations/new", "29-reconciliations-new"],
  ["/products", "30-products"],
  ["/products/new", "31-products-new"],
  ["/customers", "32-customers"],
  ["/customers/new", "33-customers-new"],
  ["/suppliers", "34-suppliers"],
  ["/prices", "35-prices"],
  ["/dictionaries", "36-dictionaries"],
  ["/branch-sales", "37-branch-sales"],
  ["/reports", "38-reports"],
  ["/reports/sales", "39-reports-sales"],
  ["/reports/products", "40-reports-products"],
  ["/reports/expenses", "41-reports-expenses"],
  ["/reports/pickers", "42-reports-pickers"],
  ["/reports/markers", "43-reports-markers"],
  ["/company", "44-company"],
  ["/settings", "45-settings"],
  ["/settings/branches", "46-settings-branches"],
  ["/settings/warehouses", "47-settings-warehouses"],
  ["/settings/employees", "48-settings-employees"],
  ["/settings/roles", "49-settings-roles"],
  ["/settings/audit", "50-settings-audit"],
  ["/warehouse", "51-warehouse"],
  ["/picking", "52-picking"],
  ["/marking", "53-marking"],
  ["/driver", "54-driver"],
  ["/profile", "55-profile"],
  ["/orders/1", "60-buyurtma-karta"],
  ["/receipts/1", "61-kirim-hujjat"],
  ["/customer-returns/1", "62-qm-hujjat"],
  ["/write-offs/1", "63-hc-hujjat"],
  ["/supplier-returns/1", "64-qy-hujjat"],
  ["/inventory-counts/1", "65-in-hujjat"],
  ["/customers/1", "66-mijoz-karta"],
  ["/products/1", "67-mahsulot-karta"],
];

async function shot(page: Page, name: string) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}.jpg`, type: "jpeg", quality: 60 });
}

test.describe("demo skrinshotlar", () => {
  test.skip(!process.env.DEMO_SHOTS, "faqat demo workflow'ida");

  test("asosiy sahifalar", async ({ page }) => {
    test.setTimeout(600_000);
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

  test("rollar bosh sahifasi", async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    mkdirSync(OUT, { recursive: true });
    const roles: [string, string][] = [
      ["director.1", "Rol-parol-2026"],
      ["manager.1", "Rol-parol-2026"],
      ["operator.1", "Operator-parol-2026"],
      ["buyer.1", "Rol-parol-2026"],
      ["accountant.1", "Rol-parol-2026"],
      ["cashier.1", "Rol-parol-2026"],
      ["keeper.1", "Rol-parol-2026"],
      ["picker.1", "Rol-parol-2026"],
      ["marker.1", "Rol-parol-2026"],
      ["driver.1", "Rol-parol-2026"],
    ];
    for (const [login, password] of roles) {
      const ctx = await browser.newContext({ baseURL, viewport: { width: 1440, height: 900 } });
      const page = await ctx.newPage();
      await page.goto("/login");
      await page.getByLabel("Login", { exact: true }).fill(login);
      await page.getByLabel("Parol", { exact: true }).fill(password);
      await page.getByRole("button", { name: /kirish/i }).click();
      await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15_000 }).catch(() => undefined);
      await shot(page, `rol-${login.replace(".1", "")}`);
      await ctx.close();
    }
  });
});
