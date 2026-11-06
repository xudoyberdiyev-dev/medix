import { expect, test, type Page } from "@playwright/test";

/**
 * Rollar boʻyicha toʻliq buyurtma zanjiri (egasi ustuvorligi 06.11 — №2): har qadamni oʻz roli bajaradi.
 * Operator buyurtma kiritadi → Ombor mudiri vaqt beradi → Yigʻuvchi yigʻadi → Ombor mudiri hisobdan oʻtkazadi va reys
 * tuzadi → Haydovchi qabul qiladi, yetkazadi (rasm + naqd) va reysni yakunlaydi → Kassir haydovchidan pulni qabul qiladi.
 * `first-run.spec.ts` dan keyin ishlaydi (oʻsha bazadagi CEO, filial, ombor, mahsulot va qoldiqdan foydalanadi).
 */
test.describe.configure({ mode: "serial" });

const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const OPERATOR_PASSWORD = "Operator-parol-2026";
const TEMP = "Vaqtincha-parol-2";
const PASSWORD = "Rol-parol-2026";
const CUSTOMER = "Baraka Dorixona E2E";
const PLATE = "01 E 777 EE";

const STAFF = [
  { name: "Olim Omborov", login: "keeper.1", role: /^Ombor mudiri$/ },
  { name: "Yusuf Yigʻuvchiyev", login: "picker.1", role: /^Yig.uvchi$/ },
  { name: "Hasan Haydovchiyev", login: "driver.1", role: /^Haydovchi$/ },
  { name: "Komila Kassirova", login: "cashier.1", role: /^Kassir$/ },
] as const;

/** 1×1 PNG — yetkazish rasmi uchun. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

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

/** Birinchi kirish: vaqtinchalik parol → doimiy parol → bosh sahifa. */
async function firstLogin(page: Page, user: string) {
  await login(page, user, TEMP);
  await expect(page).toHaveURL(/\/password/);
  await field(page, "Joriy parol").fill(TEMP);
  await field(page, "Yangi parol").fill(PASSWORD);
  await field(page, "Yangi parolni takrorlang").fill(PASSWORD);
  await page.getByRole("button", { name: "Parolni saqlash" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function choose(page: Page, label: string, option: RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

test("CEO: ombor, yigʻuvchi, haydovchi va kassir xodimlari, mashina, mijoz", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/settings/employees");
  for (const s of STAFF) {
    await page.getByRole("button", { name: "Xodim qoʻshish" }).click();
    const dialog = page.getByRole("dialog", { name: "Yangi xodim" });
    await dialog.getByLabel(/^F\.I\.Sh\.\s*\*?$/).fill(s.name);
    await dialog.getByLabel(/^Login\s*\*?$/).fill(s.login);
    await choose(page, "Rol", s.role);
    await choose(page, "Filial", /Toshkent/);
    await dialog.getByLabel(/^Vaqtinchalik parol\s*\*?$/).fill(TEMP);
    await dialog.getByRole("button", { name: "Xodimni saqlash" }).click();
    await expect(page.getByText("Xodim qoʻshildi").first()).toBeVisible();
    await expect(page.getByRole("cell", { name: s.login, exact: true })).toBeVisible();
  }

  // Mashina (filial doirasida, sigʻimi 40 joy)
  await page.goto("/dictionaries?tab=vehicles");
  await page.getByRole("button", { name: "Mashina qoʻshish" }).click();
  await choose(page, "Filial", /Toshkent/);
  await field(page, "Davlat raqami").fill(PLATE);
  await field(page, "Model").fill("Damas");
  await field(page, "Sigʻimi (joy)").fill("40");
  await page.getByRole("button", { name: "Mashinani saqlash" }).click();
  await expect(page.getByText("Mashina qoʻshildi").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Mijoz
  await page.goto("/customers");
  await page.getByRole("button", { name: "Mijoz qoʻshish" }).click();
  await field(page, "STIR / JShShIR").fill("305559876");
  await field(page, "Nomi").fill(CUSTOMER);
  await page.getByRole("button", { name: "Kartani saqlash" }).click();
  await expect(page.getByText("Kontragent qoʻshildi")).toBeVisible();
  await page.keyboard.press("Escape");

  // Pul hisoblari: ikkinchi kassa va bank hisobi; Kassa 2 — Komila Kassirovaga biriktiriladi
  await page.goto("/cash");
  await page.getByRole("button", { name: /^Filial:/ }).click();
  await page.getByRole("option").nth(1).click();
  await page.getByRole("button", { name: "Hisob qoʻshish" }).click();
  await choose(page, "Turi", /^Kassa$/);
  await field(page, "Nomi").fill("Kassa 2");
  await page.getByRole("button", { name: "Hisobni saqlash" }).click();
  await expect(page.getByText("Hisob qoʻshildi").first()).toBeVisible();
  await page.getByRole("button", { name: "Hisob qoʻshish" }).click();
  await field(page, "Nomi").fill("Asosiy bank hisobi");
  await field(page, "Hisob raqami").fill("1234");
  await page.getByRole("button", { name: "Hisobni saqlash" }).click();
  await expect(page.getByText("Hisob raqami 20 ta raqamdan iborat boʻlishi kerak.")).toBeVisible();
  await field(page, "Hisob raqami").fill("20208000900123456789");
  await page.getByRole("button", { name: "Hisobni saqlash" }).click();
  await expect(page.getByRole("button", { name: /Asosiy bank hisobi/ })).toBeVisible();

  await page.getByRole("button", { name: "Kassirlar" }).click();
  await page.getByRole("combobox", { name: /^Kassa 2 · / }).click();
  await page.getByRole("option", { name: /Komila Kassirova/ }).click();
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Kassirlar saqlandi").first()).toBeVisible();
});

test("Operator: naqd toʻlovli buyurtma kiritadi va navbatga yuboradi", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await choose(page, "Toʻlov turi", /^Naqd/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("4");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await expect(page.getByText("10.000,00 soʻm", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();
  // Operatorda vaqt berish yoʻq — bu Ombor mudiri ishi
  await expect(page.getByRole("button", { name: "Vaqt berish" })).toHaveCount(0);
});

test("Ombor mudiri: birinchi kirish, yigʻish vaqtini beradi", async ({ page }) => {
  await firstLogin(page, "keeper.1");
  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Ombor mudiri paneli" })).toBeVisible();
  await page.getByRole("tab", { name: /^Vaqt berish/ }).click();
  await page.getByRole("list", { name: "Vaqt berilmagan buyurtmalar" }).getByText(CUSTOMER).click();
  await field(page, "Yigʻish vaqti").fill("15");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByText("Vaqt berildi")).toBeVisible();
});

test("Yigʻuvchi: birinchi kirish, buyurtmani yigʻadi", async ({ page }) => {
  await firstLogin(page, "picker.1");
  await page.goto("/picking");
  await page.getByRole("button", { name: "Yigʻishni boshlash" }).first().click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByText("Olindi").first().click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();
  // Yigʻuvchiga Kassa yopiq
  await expect(page.getByRole("link", { name: "Kassa" })).toHaveCount(0);
});

test("Ombor mudiri: hisobdan oʻtkazadi va reys tuzadi", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("region", { name: "Hisobdan oʻtkazilmoqda" }).getByText(CUSTOMER).click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  await page.getByText("Tekshirildi").first().click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/shipments");
  const ready = page.getByRole("region", { name: "Joʻnatishga tayyor" });
  await ready.getByRole("listitem").filter({ hasText: CUSTOMER }).getByText("Reysga").click();
  await choose(page, "Mashina", /01 E 777 EE/);
  await choose(page, "Haydovchi", /Hasan Haydovchiyev/);
  await page.getByRole("button", { name: "Reysni rejalashtirish" }).click();
  await expect(page.getByText(/^Reys RS-.* rejalashtirildi$/).first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Faol reyslar" })).toContainText("Hasan Haydovchiyev");
});

test("Haydovchi: qabul qiladi, yetkazadi (rasm + naqd), reysni yakunlaydi", async ({ page }) => {
  await firstLogin(page, "driver.1");
  await page.goto("/driver");
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Qabul qildim" }).click();
  await expect(page.getByText("Hammasi qabul qilindi")).toBeVisible();
  await page.getByRole("button", { name: "Yuklab boʻlindi — reysni boshlash" }).click();
  await expect(page.getByText("Reys boshlandi").first()).toBeVisible();

  await page.getByLabel(`Rasm: ${CUSTOMER}`).setInputFiles({ name: "yetkazildi.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Rasm: 1")).toBeVisible();
  await field(page, "Naqd olindi").fill("10.000,00");
  await page.getByRole("button", { name: "Yetkazildi", exact: true }).click();
  await page.getByRole("button", { name: "Reysni yakunlash" }).click();
  await expect(page.getByText("Reys yakunlandi").first()).toBeVisible();
});

test("Kassir: haydovchidagi pulni qabul qiladi (MT)", async ({ page }) => {
  await firstLogin(page, "cashier.1");
  await page.goto("/cash");
  await expect(page.getByRole("heading", { name: "Haydovchidagi pul" })).toBeVisible();
  await expect(page.getByText(CUSTOMER).first()).toBeVisible();
  // Kassir faqat oʻz kassasida: tanlovda faqat «Kassa 2» (Asosiy kassada esa CEO kunni yopgan)
  await expect(page.getByRole("combobox", { name: "Qabul qilinadigan kassa", exact: true })).toHaveText(/Kassa 2/);
  await page.getByRole("button", { name: "Qabul qildim" }).first().click();
  await expect(page.getByText("Pul qabul qilindi").first()).toBeVisible();
  await expect(page.getByText("Haydovchilarda pul yoʻq")).toBeVisible();
  await expect(page.getByRole("button", { name: /Kassa 2.*10\.000,00 soʻm/ })).toBeVisible();
  // Kassir hisob qoʻsha olmaydi
  await expect(page.getByRole("button", { name: "Hisob qoʻshish" })).toHaveCount(0);
});

test("Operator: buyurtma «Yetkazildi» holatida", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Yetkazildi/ }).click();
  await expect(page.getByRole("cell", { name: CUSTOMER }).first()).toBeVisible();
});
