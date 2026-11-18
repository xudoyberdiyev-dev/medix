import { expect, test } from "@playwright/test";

/**
 * P1 + P3 — xavfsizlik: sahifalarda xavfsizlik sarlavhalari (CSP, HSTS, nosniff, frame-ancestors),
 * ilova sahifalarida CSP buzilishi yoʻq va P1 da yopilgan API'lar ruxsati bor rolga 403 qaytarmaydi.
 * Foydalanuvchi `keeper.1` (Ombor mudiri) — `roles-chain.spec.ts` da yaratilgan.
 */
const P1_API =
  /\/api\/(counterparties|products|dictionaries|vehicles|expense-items|employee-lookup|search|stock\/product-card|warehouses|price-types|prices|price-changes|branches|profile|notifications)(\/|\?|$)/;

test("kirish sahifasida xavfsizlik sarlavhalari (P3)", async ({ page }) => {
  const res = await page.goto("/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("default-src 'self'");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["permissions-policy"]).toContain("camera=()");
  expect(h["x-powered-by"]).toBeUndefined();
});

test("ilova sahifalarida CSP buzilishi va P1 403 yoʻq (Ombor mudiri)", async ({ page }) => {
  const violations: string[] = [];
  const forbidden: string[] = [];
  page.on("console", (m) => {
    if (/Content Security Policy|Refused to/.test(m.text())) violations.push(m.text());
  });
  page.on("response", (r) => {
    if (r.status() === 403 && P1_API.test(r.url())) forbidden.push(r.url());
  });
  await page.goto("/login");
  await page.getByLabel(/^Login\s*\*?$/).fill("keeper.1");
  await page.getByLabel(/^Parol\s*\*?$/).fill("Rol-parol-2026");
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const path of ["/", "/stock", "/receipts", "/products", "/customers", "/suppliers", "/prices", "/orders"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  expect(violations, violations.join("\n")).toEqual([]);
  expect(forbidden, forbidden.join("\n")).toEqual([]);
});
