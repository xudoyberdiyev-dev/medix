import { expect, test, type Page } from "@playwright/test";

/**
 * O23 — sahifa balandligi: kirish sahifasi bitta ekranga sigʻadi (1366×768, 1920×1080), ilova qobigʻida
 * faqat kontent aylanadi — hujjat ekran balandligidan oshmaydi, sidebar har doim toʻliq balandlikda.
 * Foydalanuvchi `keeper.1` — `roles-chain.spec.ts` da yaratilgan.
 */
const SIZES = [
  { width: 1366, height: 768 },
  { width: 1920, height: 1080 },
] as const;

async function docFits(page: Page) {
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    inner: window.innerHeight,
  }));
  expect(r.doc, "hujjat ekran balandligidan oshmasligi kerak").toBeLessThanOrEqual(r.inner);
}

for (const size of SIZES) {
  test(`kirish sahifasi ${size.width}×${size.height} — scroll yoʻq (O23b)`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Kirish", exact: true })).toBeVisible();
    for (const tab of ["Savdo", "Ombor", "Markirovka", "Yetkazish", "Pul"]) {
      await page.getByRole("tab", { name: tab }).click();
      await docFits(page);
    }
  });
}

test("ilova qobigʻi — faqat kontent aylanadi, sidebar toʻliq balandlikda (O23a)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel(/^Login\s*\*?$/).fill("keeper.1");
  await page.getByLabel(/^Parol\s*\*?$/).fill("Rol-parol-2026");
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  for (const path of ["/", "/stock", "/receipts"]) {
    await page.goto(path);
    await expect(page.locator("[data-app-content] main")).toBeVisible();
    await page.waitForLoadState("networkidle");
    // Har qanday sahifaning oxiriga aylantiramiz — hujjat choʻzilmasligi va sidebar uzilmasligi kerak.
    await page.locator("[data-app-content] main").evaluate((m) => m.scrollTo(0, m.scrollHeight));
    await page.mouse.wheel(0, 5000);
    await docFits(page);
    const sidebar = await page.locator("aside").first().boundingBox();
    expect(sidebar?.y ?? -1).toBe(0);
    expect(Math.round((sidebar?.y ?? 0) + (sidebar?.height ?? 0))).toBe(768);
  }
});
