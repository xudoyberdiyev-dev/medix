import { expect, test, type Page } from "@playwright/test";
import { auditContrast } from "./contrast";

/**
 * O24 — qorongʻi rejim butun ilovada: haqiqiy maʼlumot bilan asosiy sahifalar, rol panellari (telefon),
 * hujjat oynalari va kirish sahifasi. Har sahifada: `<html>` qorongʻi, koʻrinadigan matn kontrasti WCAG AA
 * (`auditContrast`), ekranda katta oq (yorugʻ) dogʻ yoʻq. Tizim mavzusi — qorongʻi (foydalanuvchi tanlovi «Tizim boʻyicha»).
 * Foydalanuvchilar `first-run` / `roles-chain` da yaratilgan.
 */
test.describe.configure({ mode: "serial" });
test.use({ colorScheme: "dark" });

const PASSWORD = "Rol-parol-2026";

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, user: string, password = PASSWORD) {
  await page.goto("/login");
  await field(page, "Login").fill(user);
  await field(page, "Parol").fill(password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function settle(page: Page) {
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // Skeleton/yuklanish tugashini kutish.
  await expect(page.locator("[data-skeleton], .animate-skeleton").first())
    .toBeHidden({ timeout: 10_000 })
    .catch(() => undefined);
  await page.waitForTimeout(300);
}

async function expectDark(page: Page, where: string) {
  await settle(page);
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  const { low, bright } = await auditContrast(page);
  expect.soft(low, `${where}: past kontrastli matn`).toEqual([]);
  expect.soft(bright, `${where}: qorongʻi rejimda oq fon`).toEqual([]);
}

test("kirish sahifasi qorongʻi rejimda (O24)", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Kirish", exact: true })).toBeVisible();
  await expectDark(page, "/login");
  // Har modul sahnasi (Savdo, Ombor, Markirovka, Yetkazish, Pul).
  const tabs = page.getByRole("tablist").first().getByRole("tab");
  const n = await tabs.count();
  for (let i = 0; i < n; i++) {
    await tabs.nth(i).click();
    await expectDark(page, `/login sahna ${i + 1}`);
  }
});

const DIRECTOR_PAGES = [
  "/",
  "/orders",
  "/invoices",
  "/receipts",
  "/stock",
  "/customers",
  "/suppliers",
  "/products",
  "/prices",
  "/cash",
  "/payments",
  "/debts/customers",
  "/reports",
  "/messages",
  "/approvals",
  "/expiry",
  "/transfers",
  "/company",
  "/profile",
];

test("direktor: asosiy sahifalar qorongʻi rejimda (O24)", async ({ page }) => {
  test.setTimeout(240_000);
  await login(page, "director.1");
  for (const path of DIRECTOR_PAGES) {
    await page.goto(path);
    await expect(page.locator("main"), path).toBeVisible();
    await expectDark(page, path);
  }
});

test("hujjat oynalari: buyurtma va hisob-faktura qorongʻi rejimda (O24)", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page, "director.1");
  for (const path of ["/orders", "/invoices"]) {
    await page.goto(path);
    await settle(page);
    const row = page.locator("main table tbody tr").first();
    if (!(await row.isVisible().catch(() => false))) continue;
    await row.click();
    await settle(page);
    await expectDark(page, `${path} → hujjat`);
    const edit = page.getByRole("button", { name: /Tahrirlash/ }).first();
    if (await edit.isVisible().catch(() => false)) {
      await edit.click();
      await expectDark(page, `${path} → tahrirlash oynasi`);
      await page.keyboard.press("Escape");
    }
  }
});

const PHONE = [
  { user: "picker.1", path: "/picking" },
  { user: "marker.1", path: "/marking" },
  { user: "driver.1", path: "/driver" },
  { user: "keeper.1", path: "/warehouse" },
  { user: "cashier.1", path: "/cash" },
] as const;

for (const p of PHONE) {
  test(`telefon (360 px): ${p.user} paneli qorongʻi rejimda (O24)`, async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await login(page, p.user);
    // keeper.1 boshqa testda mavzuni «Yorugʻ» ga qoʻygan boʻlishi mumkin — «Tizim boʻyicha» ga qaytaramiz.
    await page.goto("/profile");
    await page.getByRole("radiogroup", { name: "Mavzu" }).getByRole("radio", { name: "Tizim boʻyicha" }).click();
    await page.goto("/");
    await expectDark(page, `${p.user} /`);
    await page.goto(p.path);
    await expectDark(page, `${p.user} ${p.path}`);
    await page.getByRole("button", { name: "Menyuni ochish" }).click();
    await expectDark(page, `${p.user} menyu`);
  });
}
