import { expect, test, type Page } from "@playwright/test";

/**
 * Qurilmalar (SPEC 3): Yigʻuvchi, Markirovkachi va Haydovchi panellari telefonda (360 px), Ombor mudiri planshetda (1024 px).
 * Sahifa gorizontal aylanmasligi, menyu tugma orqali ochilishi, profil va chiqish ishlashi tekshiriladi.
 * Foydalanuvchilar `roles-chain.spec.ts` da yaratilgan.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "Rol-parol-2026";

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, login: string) {
  await page.goto("/login");
  await field(page, "Login").fill(login);
  await field(page, "Parol").fill(PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Hujjat ham, asosiy qism (`main`) ham ekran kengligidan oshmaydi (ichki aylanuvchi yorliqlar/jadvallar hisobga olinmaydi). */
async function expectNoHorizontalOverflow(page: Page, where = "") {
  const overflow = await page.evaluate(() => {
    const main = document.querySelector("main");
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      main: main ? main.scrollWidth - main.clientWidth : 0,
    };
  });
  expect(overflow.page, `${where} sahifa gorizontal aylanmasligi kerak`).toBeLessThanOrEqual(1);
  expect.soft(overflow.main, `${where} asosiy qism gorizontal aylanmasligi kerak`).toBeLessThanOrEqual(1);
}

const PHONE_PANELS = [
  { login: "picker.1", path: "/picking", heading: "Yigʻuvchi paneli", nav: "Yigʻish" },
  { login: "marker.1", path: "/marking", heading: "Markirovkachi paneli", nav: "Markirovka" },
  { login: "driver.1", path: "/driver", heading: "Haydovchi paneli", nav: "Reysim" },
] as const;

for (const panel of PHONE_PANELS) {
  test(`Telefon (360 px): ${panel.login} — panel sigʻadi, menyu, profil va chiqish`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, panel.login);
    await expect(page.getByRole("navigation", { name: "Asosiy menyu" })).toBeHidden();

    await page.goto(panel.path);
    await expect(page.getByRole("heading", { level: 1, name: panel.heading })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Menyuni ochish" }).click();
    const menu = page.getByRole("dialog", { name: "Asosiy menyu" });
    await expect(menu.getByRole("link", { name: panel.nav, exact: true })).toBeVisible();
    await menu.getByRole("link", { name: "Bosh sahifa" }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(menu).toBeHidden();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("button", { name: "Menyuni ochish" }).click();
    // Prototip: chiqish — foydalanuvchi menyusida
    await page.getByRole("dialog", { name: "Asosiy menyu" }).getByRole("button", { name: "Foydalanuvchi menyusi" }).click();
    await page.getByRole("menuitem", { name: "Chiqish" }).click();
    await expect(page).toHaveURL(/\/login/);
  });
}

test("Planshet (1024 px): Ombor mudiri — ixcham menyu, panel sigʻadi", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await login(page, "keeper.1");
  const nav = page.getByRole("navigation", { name: "Asosiy menyu" });
  await expect(nav).toBeVisible();
  await expect(page.getByRole("button", { name: "Menyuni ochish" })).toBeHidden();
  await nav.getByRole("link", { name: "Monitor" }).click();
  await expect(page).toHaveURL(/\/warehouse/);
  await expectNoHorizontalOverflow(page);
  const hrefs = [...new Set(await nav.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "")))];
  for (const path of hrefs) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
    await page.waitForTimeout(500);
    await expectNoHorizontalOverflow(page, path);
  }
});
