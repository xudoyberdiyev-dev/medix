import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * O15 (egasi 17.11.2026): kutilayotgan kirim (yuk xati) → tasdiqlanganda qarz darhol yoziladi, tovar «Yoʻlda» →
 * kelganda «Qabul qilish» — kirim qoralamasi KK dan tuziladi. Maʼlumot first-run dan (CEO, «Markaziy ombor», «Pharm Supply E2E»,
 * «Paracetamol E2E»).
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function choose(page: Page, scope: Page | Locator, label: string, option: RegExp, search?: string) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  if (search) await page.getByPlaceholder("Qidirish").fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

const today = () => {
  const [y, m, d] = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Tashkent" }).split("-");
  return `${d}.${m}.${y}`;
};

test("O15: KK → tasdiq (qarz darhol, Yoʻlda) → qabul qilish — kirim qoralamasi", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/expected-receipts");
  await expect(page.getByRole("main").getByRole("heading", { name: /Kutilayotgan kirimlar/ })).toBeVisible();
  await page.getByRole("button", { name: "Yangi kutilayotgan kirim" }).first().click();
  await expect(page).toHaveURL(/\/expected-receipts\/new$/);
  await choose(page, page, "Ombor", /Markaziy ombor/);
  await choose(page, page, "Yetkazib beruvchi", /Pharm Supply E2E/, "Pharm");
  await field(page, "Yuk xati №").fill("TTN-E2E-15");
  await field(page, "Yuk xati sanasi").fill(today());
  await choose(page, page, "Mahsulot", /Paracetamol E2E/, "E2E");
  await field(page, "Soni").fill("10");
  await field(page, "Narx (1 dona)").fill("1000");
  await page.getByRole("button", { name: "Qoʻshish", exact: true }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page).toHaveURL(/\/expected-receipts\/\d+$/);
  await expect(page.getByText(/Tasdiqlanganda yetkazib beruvchi qarzi darhol yoziladi/)).toBeVisible();

  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText(/Tovar yoʻlda — kutilgan sana/)).toBeVisible();
  await expect(page.getByText(/Qarz yozilgan: 10\.000,00/)).toBeVisible();

  await page.getByRole("button", { name: "Qabul qilish", exact: true }).click();
  const dlg = page.getByRole("dialog");
  await choose(page, dlg, "Zona", /Asosiy saqlash/);
  await dlg.getByLabel(/^Soni\s*\*?$/).fill("8");
  await dlg.getByLabel(/^Partiya\s*\*?$/).fill("KK-E2E");
  await dlg.getByLabel(/^Yaroqlilik\s*\*?$/).fill("30.06.2029");
  await dlg.getByRole("button", { name: "Kirim qoralamasini yaratish" }).click();
  await expect(page.getByText("Kirim qoralamasi yaratildi — sanab, qabul qiling")).toBeVisible();
  await expect(page.getByRole("link", { name: /^KR-/ })).toBeVisible();
});
