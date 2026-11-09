import { expect, test } from "@playwright/test";

/**
 * Tillar smoke (SPEC 10): CEO rus va kirill tilida asosiy sahifalarni ochadi — sahifa xatosi yoʻq,
 * next-intl lugʻatda yoʻq kalit yoki ICU xatosi haqida xabar bermaydi. Maʼlumot roles-chain dan keyin bor.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const PAGES = [
  "/",
  "/orders",
  "/warehouse",
  "/shipments",
  "/stock",
  "/receipts",
  "/transfers",
  "/zone-transfers",
  "/warehouse-transfers",
  "/branch-sales",
  "/inventory-counts",
  "/write-offs",
  "/supplier-returns",
  "/expiry",
  "/opening",
  "/payments",
  "/cash",
  "/debts/customers",
  "/debts/suppliers",
  "/bonuses",
  "/products",
  "/customers",
  "/suppliers",
  "/prices",
  "/dictionaries",
  "/reports",
  "/settings",
  "/profile",
];

for (const [locale, loginLabel, passwordLabel, submit] of [
  ["ru", "Логин", "Пароль", "Войти"],
  ["uz-Cyrl", "Логин", "Парол", "Кириш"],
] as const) {
  test(`asosiy sahifalar ${locale} tilida`, async ({ page, context, baseURL }) => {
    test.setTimeout(180_000);
    await context.addCookies([{ name: "MEDIX_LOCALE", value: locale, url: baseURL ?? "http://localhost:3000" }]);
    const problems: string[] = [];
    page.on("pageerror", (e) => problems.push(`${page.url()}: ${e.message}`));
    page.on("console", (m) => {
      if (m.type() === "error" && /MISSING_MESSAGE|FORMATTING_ERROR|INVALID_KEY/.test(m.text()))
        problems.push(`${page.url()}: ${m.text()}`);
    });

    await page.goto("/login");
    await page.getByLabel(new RegExp(`^${loginLabel}\\s*\\*?$`)).fill(CEO_LOGIN);
    await page.getByLabel(new RegExp(`^${passwordLabel}\\s*\\*?$`)).fill(CEO_PASSWORD);
    await page.getByRole("button", { name: submit, exact: true }).click();
    await expect(page).not.toHaveURL(/\/login/);

    for (const path of PAGES) {
      await page.goto(path);
      await expect(page.locator("main").first()).toBeVisible();
      await page.waitForLoadState("networkidle");
    }
    expect(problems).toEqual([]);
  });
}
