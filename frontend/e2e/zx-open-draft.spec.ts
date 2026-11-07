import { expect, test, type Page } from "@playwright/test";

/**
 * Ochiq hujjat (SPEC 208): Operator yangi buyurtmaga qator qoʻshadi, saqlamasdan boshqa sahifaga oʻtadi va qaytadi —
 * buyurtma shu holatda ochiladi; «Saqlamasdan yopish» dan keyin qayta ochilmaydi. Maʼlumot roles-chain dan keyin bor.
 */
const OPERATOR_PASSWORD = "Operator-parol-2026";

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

test("Operator: saqlanmagan buyurtma boshqa sahifadan qaytganda tiklanadi", async ({ page }) => {
  // Saqlanmagan oʻzgarishda brauzer «sahifadan chiqasizmi?» deb soʻraydi — e2e da «Ha»
  page.on("dialog", (d) => void d.accept());
  await page.goto("/login");
  await field(page, "Login").fill("operator.1");
  await field(page, "Parol").fill(OPERATOR_PASSWORD);
  await page.getByRole("button", { name: "Tizimga kirish" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await page.getByRole("combobox", { name: "Ombor", exact: true }).click();
  await page
    .getByRole("option", { name: /Markaziy ombor/ })
    .first()
    .click();
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("3");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: /Paracetamol E2E/ })).toBeVisible();

  await page.goto("/products");
  await expect(page.getByRole("heading", { name: "Mahsulotlar" })).toBeVisible();
  await page.goto("/orders");
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("cell", { name: /Paracetamol E2E/ })).toBeVisible();
  await expect(drawer.getByText("Baraka Dorixona E2E").first()).toBeVisible();

  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Saqlamasdan yopish" }).click();
  await page.goto("/orders");
  await expect(page.getByRole("button", { name: "Buyurtma kiritish" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
