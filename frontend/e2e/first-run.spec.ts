import { expect, test, type Page } from "@playwright/test";

/**
 * Birinchi ishga tushirish (SPEC 2): CEO env hisobi bilan kiradi → parolni almashtiradi → sozlash ustasi
 * (kompaniya → filial → ombor → rollar → xodim → yakun) → Sozlamalar → Xodimlar; yangi xodim birinchi kirishda
 * parolni almashtiradi. Bitta toza bazada ketma-ket ishlaydi.
 */
test.describe.configure({ mode: "serial" });

const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_INITIAL = process.env.E2E_CEO_PASSWORD ?? "Boshlangich-parol-2026";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const OPERATOR_TEMP = "Vaqtincha-parol-1";
const OPERATOR_PASSWORD = "Operator-parol-2026";

/** Maydon yorligʻi boʻyicha (aniq moslik; majburiy maydondagi «*» hisobga olinmaydi). */
function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, login: string, password: string) {
  await page.goto("/login");
  await field(page, "Login").fill(login);
  await field(page, "Parol").fill(password);
  await page.getByRole("button", { name: "Tizimga kirish" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/password/);
  await field(page, "Joriy parol").fill(current);
  await field(page, "Yangi parol").fill(next);
  await field(page, "Yangi parolni takrorlang").fill(next);
  await page.getByRole("button", { name: "Parolni saqlash" }).click();
}

async function choose(page: Page, label: string, option: RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).click();
}

test("CEO: birinchi kirish, sozlash ustasi, xodim qoʻshish", async ({ page }) => {
  await login(page, CEO_LOGIN, "notogri-parol");
  await expect(page.getByText("Login yoki parol notoʻgʻri")).toBeVisible();

  await login(page, CEO_LOGIN, CEO_INITIAL);
  await changePassword(page, CEO_INITIAL, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole("link", { name: "Sozlash ustasini ochish" }).click();

  // 1. Kompaniya
  await field(page, "Kompaniya (guruh) nomi").fill("Medix Group");
  await page.getByRole("button", { name: "Saqlash va davom etish" }).click();

  // 2. Filial
  await field(page, "Kod").fill("TSH");
  await field(page, "Nomi").fill("Toshkent");
  await field(page, "Yuridik nomi").fill("Medix TSH MChJ");
  await field(page, "STIR").fill("301234567");
  await page.getByRole("button", { name: "Filial qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: "Toshkent", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();

  // 3. Ombor
  await choose(page, "Filial", /Toshkent/);
  await field(page, "Ombor nomi").fill("Markaziy ombor");
  await page.getByText("Sovuq", { exact: true }).click();
  await page.getByRole("button", { name: "Ombor qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: "Markaziy ombor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();

  // 4. Rollar
  await expect(page.getByText("11 ta standart rol tayyor")).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();

  // 5. Xodim
  await field(page, "F.I.Sh.").fill("Dilshod Aliyev");
  await field(page, "Login").fill("operator.1");
  await choose(page, "Rol", /^Operator$/);
  await choose(page, "Filial", /Toshkent/);
  await field(page, "Vaqtinchalik parol").fill(OPERATOR_TEMP);
  await page.getByRole("button", { name: "Xodim qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: "operator.1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();

  // 6. Yakun
  await page.getByRole("button", { name: "Ustani yakunlash" }).click();
  await expect(page.getByText("Sozlash yakunlandi")).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  // Sozlamalar → Filiallar, Omborlar, Xodimlar
  await page.goto("/settings/branches");
  await expect(page.getByRole("cell", { name: "TSH", exact: true })).toBeVisible();
  await page.goto("/settings/warehouses");
  await expect(page.getByText("Markaziy ombor")).toBeVisible();
  await page.goto("/settings/employees");
  await expect(page.getByRole("cell", { name: "operator.1", exact: true })).toBeVisible();
  await expect(page.getByText("Parol almashtirilmagan")).toBeVisible();

  // Profil: PIN oʻrnatish
  await page.goto("/profile");
  await field(page, "Joriy parol").first().fill(CEO_PASSWORD);
  await field(page, "PIN").fill("4826");
  await field(page, "PIN takrori").fill("4826");
  await page.getByRole("button", { name: "PIN oʻrnatish" }).click();
  await expect(page.getByText("PIN oʻrnatildi")).toBeVisible();
});

test("Operator: vaqtinchalik parol bilan kirish va almashtirish; Sozlamalar yopiq", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_TEMP);
  await changePassword(page, OPERATOR_TEMP, OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("link", { name: "Sozlamalar" })).toHaveCount(0);
  await page.goto("/settings/employees");
  await expect(page.getByText("Xodimlarni Direktor va Bosh administrator boshqaradi.")).toBeVisible();
});
