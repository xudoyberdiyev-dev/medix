import { expect, test } from "@playwright/test";

/**
 * O20 — yangi kirish sahifasi «100+»: sana va salom, «Parolni unutdingizmi?» / «Kira olmayapman» oynalari, til menyusi,
 * qorongʻi rejim, maʼlumot kartasi (rollar soni ommaviy /api/auth/login-info dan).
 */
test("kirish sahifasi 100+ (O20, O22 yakuniy dizayn)", async ({ page }) => {
  const info = page.waitForResponse((r) => r.url().includes("/api/auth/login-info") && r.status() === 200);
  await page.goto("/login");
  await expect(page).toHaveTitle(/100\+/);
  await expect(page.getByRole("heading", { level: 1, name: /^Xayrli (tong|kun|kech)$/ })).toBeVisible();
  await expect(page.getByText("Ishni davom ettirish uchun tizimga kiring")).toBeVisible();
  const roles = (await (await info).json()) as { roles: number };
  expect(roles.roles).toBeGreaterThan(0);
  await expect(page.getByText("rol uchun panel")).toBeVisible();
  // O22: 5 modul sahnasi, segment-yorliqlar (bosilsa almashish toʻxtaydi)
  await expect(page.getByRole("tab", { name: "Savdo" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Markirovka" }).click();
  await expect(page.getByText("Quti va dona kodlari — bir zumda")).toBeVisible();
  await expect(page.getByRole("button", { name: "Davom ettirish" })).toBeVisible();
  await page.getByRole("tab", { name: "Pul" }).click();
  await expect(page.getByText("Qarz, kassa va akt sverka — avtomatik")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: "Loginni eslab qolish" })).toBeChecked();
  await page.getByRole("button", { name: "Xavfsizlik" }).click();
  await expect(page.getByRole("dialog", { name: "Xavfsizlik" }).getByText(/15 daqiqaga bloklanadi/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Yopish" }).last().click();

  await page.getByRole("button", { name: "Parolni unutdingizmi?" }).click();
  await expect(page.getByRole("dialog", { name: "Parolni tiklash" })).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Yopish" }).last().click();
  await page.getByRole("button", { name: "Kira olmayapman" }).click();
  await expect(page.getByRole("dialog", { name: "Kira olmayapman" }).getByText(/15 daqiqaga bloklanadi/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Yopish" }).last().click();

  await page.getByRole("button", { name: "Qorongʻi rejimga oʻtish" }).click();
  await expect(page.locator("html")).toHaveClass(/theme-dark/);
  await page.getByRole("button", { name: "Yorugʻ rejimga oʻtish" }).click();
  await expect(page.locator("html")).not.toHaveClass(/theme-dark/);

  await page.getByRole("button", { name: "Interfeys tili" }).click();
  await page.getByRole("option", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Добр(ое утро|ый день|ый вечер)$/ })).toBeVisible();
  await page.getByRole("button", { name: "Язык интерфейса" }).click();
  await page.getByRole("option", { name: "Oʻzbekcha" }).click();
  await expect(page.getByRole("button", { name: "Kirish", exact: true })).toBeVisible();
});
