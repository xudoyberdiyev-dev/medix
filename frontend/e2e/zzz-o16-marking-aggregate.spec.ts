import { expect, test, type Page } from "@playwright/test";

/**
 * O16 (egasi 17.11.2026): markirovka haqiqiy kodlari. Butun quti uchun faqat quti (agregatsiya, SSCC) kodi skanerlanadi — mahsulotning
 * «1 qadoqdagi dona» qadar hisoblanadi; ochiq dona uchun dona kodi (01+21, partiyasiz). Hisoblagich «1 quti (2 dona) + 1 dona = 3 / 3».
 * Maʼlumot first-run va roles-chain dan keyin bor (Amoksitsillin E2E — markirovkali).
 */
test.describe.configure({ mode: "serial" });

const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const OPERATOR_PASSWORD = "Operator-parol-2026";
const PASSWORD = "Rol-parol-2026";
const CUSTOMER = "Shifo Dorixona E2E";
const BARCODE = "4780000000014";
let number = "";

/** GS1 nazorat raqami (SSCC). */
function withCheckDigit(body: string): string {
  let sum = 0;
  for (let i = 0; i < body.length; i++) sum += (body.length - i) % 2 === 1 ? Number(body[i]) * 3 : Number(body[i]);
  return body + ((10 - (sum % 10)) % 10);
}

const SSCC = `00${withCheckDigit("04780000000016001")}`;
const UNIT = `010${BARCODE}21O16UNIT00001`;

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, login: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await field(page, "Login").fill(login);
  await field(page, "Parol").fill(password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function choose(page: Page, label: string, option: RegExp, search?: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  if (search) await page.getByPlaceholder("Qidirish").fill(search);
  await page.getByRole("option", { name: option }).first().click();
}

test("Direktor: markirovkali mahsulotda «1 qadoqdagi dona soni» = 2", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  const res = await page.request.get("/api/products?q=Amoksitsillin%20E2E");
  expect(res.ok()).toBeTruthy();
  const id = ((await res.json()) as { items: { id: number }[] }).items[0]?.id;
  expect(id).toBeTruthy();
  await page.goto(`/products/${id}/edit`);
  await field(page, "1 qadoqdagi dona soni").fill("2");
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Mahsulot saqlandi")).toBeVisible();
});

test("Buyurtma 3 dona → yigʻish", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Yangi buyurtma" }).click();
  await choose(page, "Mijoz", new RegExp(CUSTOMER), "Shifo");
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await choose(page, "Mahsulot", /Amoksitsillin E2E/, "Amoksitsillin");
  await field(page, "Miqdor").first().fill("3");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi").first()).toBeVisible();
  const docNumber = page.getByRole("main").getByRole("heading", { level: 1 }).locator("xpath=following-sibling::span[1]");
  await expect(docNumber).toHaveText(/^BY-[A-Z]{3}-\d{6}$/);
  number = (await docNumber.textContent()) ?? "";
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();

  await login(page, "keeper.1", PASSWORD);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Vaqt berish/ }).click();
  await page.getByRole("list", { name: "Vaqt berilmagan buyurtmalar" }).getByText(number).click();
  await field(page, "Yigʻish vaqti").fill("15");
  await field(page, "Markirovka vaqti").fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByRole("status").getByText("Vaqt berildi", { exact: true })).toBeVisible();

  await login(page, "picker.1", PASSWORD);
  await page.goto("/picking");
  await page.locator("article").filter({ hasText: number }).getByRole("button", { name: "Yigʻishni boshlash" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  for (const c of await page.getByRole("checkbox", { name: /^Olindi/ }).all()) await c.click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();
});

test("Markirovkachi: quti (SSCC) + ochiq dona → 3 / 3 → yakunlash", async ({ page }) => {
  await login(page, "marker.1", PASSWORD);
  await page.goto("/marking");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await page.locator("article").filter({ hasText: number }).getByRole("button", { name: "Markirovkani boshlash" }).click();
  const scan = page.getByLabel("Markirovka kodi");
  await expect(scan).toBeFocused();
  await expect(page.getByText(/Butun qutilar uchun faqat quti \(SSCC\) kodini/)).toBeVisible();
  await scan.fill(SSCC);
  await scan.press("Enter");
  await expect(page.getByText("1 quti (2 dona) + 0 dona = 2 / 3").first()).toBeVisible();
  await expect(page.getByText(/SSCC · quti \(2 dona\)/)).toBeVisible();
  // Takror quti — rad
  await scan.fill(SSCC);
  await scan.press("Enter");
  await expect(page.getByText("Kod qabul qilinmadi").first()).toBeVisible();
  await scan.fill(UNIT);
  await scan.press("Enter");
  await expect(page.getByText("1 quti (2 dona) + 1 dona = 3 / 3").first()).toBeVisible();

  const finish = page.getByRole("button", { name: "Saplaynʼda tekshirildi — yakunlash" });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Excelʼga chiqarish" }).click();
  expect((await download).suggestedFilename()).toMatch(/^saplayn-.*\.xlsx$/);
  await page.getByRole("checkbox", { name: /Saplaynʼda tekshirdim/ }).check();
  await finish.click();
  await expect(page.getByText("Markirovka yakunlandi").first()).toBeVisible();
});
