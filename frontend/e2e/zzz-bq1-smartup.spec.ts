import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * BQ1 (egasi 21.11.2026): Boshlangʻich qoldiq → «SmartUp dan koʻchirish» → shablon (4 varaq) → tekshirish. Shablondagi namuna
 * mahsulotlar va kontragentlar bazada yoʻq — xatolar varaq va qator bilan koʻrsatiladi, «Qoralamalarni yaratish» chiqmaydi.
 * Toʻgʻri fayl bilan yaratish va oʻtkazish — `OpeningImportIT`.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

test("BQ1: SmartUp faylini tekshirish — shablon va xatolar", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const template = await page.request.get("/api/opening-import/template");
  expect(template.ok()).toBe(true);
  const bytes = await template.body();

  await page.goto("/opening");
  await page.getByRole("button", { name: "SmartUp dan koʻchirish" }).click();
  const dialog = page.getByRole("dialog", { name: /SmartUp dan koʻchirish/ });
  await expect(dialog.getByRole("link", { name: /Shablonni yuklab olish/ })).toBeVisible();
  await dialog.getByLabel("Faylni tanlash").setInputFiles({
    name: "smartup.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: bytes,
  });
  await dialog.getByRole("button", { name: "Faylni tekshirish" }).click();

  await expect(dialog.getByText(/ta xato — hech narsa yaratilmaydi/)).toBeVisible();
  await expect(dialog.getByText(/Mahsulot topilmadi: «12345678»|Filial topilmadi/).first()).toBeVisible();
  await expect(dialog.getByText(/Tovar · 3-qator/).first()).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Xatolarni Excel uchun yuklab olish" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Qoralamalarni yaratish" })).toHaveCount(0);
});
