import { expect, test, type Page } from "@playwright/test";

/**
 * «Yigʻishga qaytarish» tanlangan qatorlar boʻyicha (SPEC 188): ikki qatorli buyurtma (oddiy + markirovkali) yigʻiladi va
 * markirovkalanadi; Ombor mudiri faqat oddiy qatorni qaytaradi — qayta yigʻishda faqat shu qator, markirovkali qator kodi
 * saqlanadi (qayta skanerlash shart emas, oddiy qator qayta tasdiqlanadi — E1), buyurtma yana «Hisobdan oʻtkazilmoqda». Maʼlumot first-run va roles-chain dan keyin bor.
 */
test.describe.configure({ mode: "serial" });

const OPERATOR_PASSWORD = "Operator-parol-2026";
const PASSWORD = "Rol-parol-2026";
const CUSTOMER = "Shifo Dorixona E2E";
const BARCODE = "4780000000014";
const mark = (serial: string) => `(01)0${BARCODE}(21)${serial}(17)291231(10)MK-01(91)D`;
let number = "";

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, login: string, password: string) {
  await page.goto("/login");
  await field(page, "Login").fill(login);
  await field(page, "Parol").fill(password);
  await page.getByRole("button", { name: "Tizimga kirish" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function choose(page: Page, label: string, option: RegExp, search?: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  if (search) await page.getByPlaceholder("Qidirish").fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

async function pick(page: Page) {
  await login(page, "picker.1", PASSWORD);
  await page.goto("/picking");
  await page.getByRole("listitem").filter({ hasText: number }).getByRole("button", { name: "Yigʻishni boshlash" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
}

test("Operator: oddiy va markirovkali qatorli buyurtma", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await choose(page, "Mijoz", new RegExp(CUSTOMER), "Shifo");
  await choose(page, "Ombor", /Markaziy ombor/);
  await choose(page, "Mahsulot", /Paracetamol E2E/, "Paracetamol");
  await field(page, "Miqdor").first().fill("1");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await choose(page, "Mahsulot", /Amoksitsillin E2E/, "Amoksitsillin");
  await field(page, "Miqdor").first().fill("1");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi").first()).toBeVisible();
  number =
    (await page
      .getByRole("dialog")
      .getByText(/^BY-[A-Z]{3}-\d{6}$/)
      .first()
      .textContent()) ?? "";
  expect(number).toMatch(/^BY-/);
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();
});

test("Ombor zanjiri: vaqt, yigʻish, markirovka", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Vaqt berish/ }).click();
  await page.getByRole("list", { name: "Vaqt berilmagan buyurtmalar" }).getByText(number).click();
  await field(page, "Yigʻish vaqti").fill("15");
  await field(page, "Markirovka vaqti").fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByText("Vaqt berildi")).toBeVisible();

  await pick(page);
  for (const c of await page.getByText("Olindi", { exact: true }).all()) await c.click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();

  await login(page, "marker.1", PASSWORD);
  await page.goto("/marking");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await page.getByRole("listitem").filter({ hasText: number }).getByRole("button", { name: "Markirovkani boshlash" }).click();
  const scan = page.getByLabel("Markirovka kodi");
  await expect(scan).toBeFocused();
  await scan.fill(mark("RP1"));
  await scan.press("Enter");
  await expect(page.getByText("1 / 1").first()).toBeVisible();
  // E1: aralash buyurtma — markirovkasiz qator «Tasdiqlash» bilan
  await page.getByRole("region", { name: "Markirovkasiz qatorlar" }).getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText("1 / 1 qator tasdiqlandi")).toBeVisible();
  await page.getByRole("button", { name: "Markirovkani yakunlash" }).click();
  await expect(page.getByText("Markirovka yakunlandi").first()).toBeVisible();
});

test("Ombor mudiri: faqat oddiy qatorni yigʻishga qaytaradi; qayta yigʻishda faqat shu qator", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await page.goto("/warehouse");
  await page.getByRole("region", { name: "Hisobdan oʻtkazilmoqda" }).getByText(number).click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  await page.getByRole("listitem").filter({ hasText: "Paracetamol E2E" }).getByText("Qaytarish", { exact: true }).click();
  await page.getByRole("button", { name: "Tanlanganlarni yigʻishga qaytarish (1)" }).click();
  await field(page, "Sabab").fill("Qadoq ezilgan");
  await page.getByRole("button", { name: "Yigʻishga qaytarish", exact: true }).click();
  await expect(page.getByText("Yigʻishga qaytarildi").first()).toBeVisible();

  // Vaqt saqlangan — yigʻuvchi darhol oladi; faqat Paracetamol qatori
  await pick(page);
  await expect(page.getByText(/^Qayta yigʻish: faqat 1 ta qator/)).toBeVisible();
  await expect(page.getByText("Olindi", { exact: true })).toHaveCount(1);
  await page.getByText("Olindi", { exact: true }).click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();

  // E1: qayta yigʻilgan markirovkasiz qator Markirovkachida qayta tasdiqlanadi; markirovkali qator kodi saqlangan
  await login(page, "marker.1", PASSWORD);
  await page.goto("/marking");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await page.getByRole("listitem").filter({ hasText: number }).getByRole("button", { name: "Markirovkani boshlash" }).click();
  const unmarked = page.getByRole("region", { name: "Markirovkasiz qatorlar" });
  await expect(unmarked).toContainText("Paracetamol E2E");
  await unmarked.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await page.getByRole("button", { name: "Markirovkani yakunlash" }).click();
  await expect(page.getByText("Markirovka yakunlandi").first()).toBeVisible();
  await login(page, "keeper.1", PASSWORD);
  await page.goto("/warehouse");
  await page.getByRole("region", { name: "Hisobdan oʻtkazilmoqda" }).getByText(number).click();
  await expect(page.getByText("Tekshirildi", { exact: true })).toHaveCount(2);
  for (const c of await page.getByText("Tekshirildi", { exact: true }).all()) await c.click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
});
