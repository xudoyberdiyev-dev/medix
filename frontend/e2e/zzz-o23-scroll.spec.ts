import { expect, test } from "@playwright/test";

/**
 * O23 — sahifa balandligi: kirish sahifasi 1366×768 va 1920×1080 da bitta ekranga sigʻadi (sahifa aylanmaydi);
 * ilovada faqat kontent maydoni aylanadi — eng pastga aylantirilganda sidebar balandligi = viewport, sahifaning oʻzi aylanmaydi.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

for (const [width, height] of [
  [1366, 768],
  [1920, 1080],
] as const) {
  test(`kirish sahifasi bitta ekranda ${width}×${height} (O23)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    for (const tab of ["Savdo", "Ombor", "Markirovka", "Yetkazish", "Pul"]) {
      await page.getByRole("tab", { name: tab }).click();
      const [scroll, inner] = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight]);
      expect(scroll, tab).toBeLessThanOrEqual(inner);
    }
    await expect(page.getByRole("button", { name: "Kirish", exact: true })).toBeInViewport();
  });
}

test("ilova qobigʻi: faqat kontent aylanadi, sidebar toʻliq balandlikda (O23)", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.goto("/login");
  await page.getByLabel("Login", { exact: true }).fill(CEO_LOGIN);
  await page.getByLabel("Parol", { exact: true }).fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).not.toHaveURL(/\/login/);
  await page.goto("/");
  const main = page.locator("[data-app-content] main");
  await expect(main).toBeVisible();
  // Uzun kontentni kafolatlash uchun kontent maydoniga balandlik qoʻshamiz
  await main.evaluate((m) => {
    const filler = document.createElement("div");
    filler.style.height = "3000px";
    m.appendChild(filler);
    m.scrollTop = m.scrollHeight;
  });
  await page.mouse.wheel(0, 5000);
  const r = await page.evaluate(() => ({
    doc: document.documentElement.scrollHeight,
    winY: window.scrollY,
    inner: window.innerHeight,
    aside: document.querySelector("aside")?.getBoundingClientRect().height ?? 0,
    mainTop: document.querySelector("[data-app-content] main")?.scrollTop ?? 0,
  }));
  expect(r.doc).toBeLessThanOrEqual(r.inner);
  expect(r.winY).toBe(0);
  expect(Math.round(r.aside)).toBe(r.inner);
  expect(r.mainTop).toBeGreaterThan(0);
});
