import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * O6 (egasi 13.11.2026): savdo zonasi yaratiladi → yangi mijozga biriktiriladi (filialda zona boʻlsa — majburiy) →
 * Mijozlar roʻyxatida «Savdo zonasi» ustunida koʻrinadi. Maʼlumot first-run dan keyin bor (CEO, «Toshkent» filiali).
 * Oxirida ishlaydi: zona paydo boʻlgach, shu filialda mijoz shartlarini zonasiz saqlab boʻlmaydi.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const ZONE = "Chilonzor E2E";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function pickIfEnabled(page: Page, scope: Page | Locator, label: string, option: RegExp) {
  const box = scope.getByRole("combobox", { name: label, exact: true });
  if (await box.isEnabled()) {
    await box.click();
    await page.getByRole("option", { name: option }).first().click();
  }
}

test("O6: savdo zonasi → yangi mijozga majburiy biriktirish → roʻyxatda koʻrinadi", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/sales-zones");
  await expect(page.getByRole("main").getByRole("heading", { name: "Savdo zonalari" })).toBeVisible();
  await page.getByRole("button", { name: "Yangi savdo zonasi" }).click();
  const dlg = page.getByRole("dialog", { name: "Yangi savdo zonasi" });
  await pickIfEnabled(page, dlg, "Filial", /Toshkent/);
  await field(dlg, "Nomi").fill(ZONE);
  await dlg.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Zona yaratildi")).toBeVisible();
  await expect(page.getByRole("cell", { name: new RegExp(ZONE) })).toBeVisible();

  await page.goto("/customers");
  await page.getByRole("button", { name: "Mijoz qoʻshish" }).first().click();
  await field(page, "STIR").fill("305559871");
  await field(page, "Qisqa nomi").fill("Zona Dorixona E2E");
  await page.getByRole("combobox", { name: "Turi", exact: true }).click();
  await page.getByRole("option", { name: /Dorixona/ }).click();
  await field(page, "Litsenziya raqami").fill("FA-E2E-Z1");
  await field(page, "Amal qilish muddati").fill("31.12.2030");
  await pickIfEnabled(page, page, "Filial", /Toshkent/);
  // Zona tanlanmasa — saqlanmaydi
  await page.getByRole("button", { name: "Kartani saqlash" }).click();
  await expect(page.getByText("Savdo zonasini tanlang.").first()).toBeVisible();
  await page.getByRole("combobox", { name: "Savdo zonasi", exact: true }).click();
  await page.getByRole("option", { name: new RegExp(ZONE) }).click();
  await page.getByRole("button", { name: "Kartani saqlash" }).click();
  await expect(page.getByText("Kontragent qoʻshildi")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/customers");
  const row = page.getByRole("row").filter({ hasText: "Zona Dorixona E2E" });
  await expect(row.getByText(ZONE)).toBeVisible();
});
