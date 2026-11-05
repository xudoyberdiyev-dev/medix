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

test("CEO: mahsulot qoʻshish va narx oʻrnatish (NO)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  // Mahsulot
  await page.goto("/products");
  await page.getByRole("button", { name: "Mahsulot qoʻshish" }).click();
  await field(page, "Nomi").fill("Paracetamol E2E 500 mg");
  await choose(page, "Birlik", /^Dona/);
  await page.getByRole("button", { name: "Mahsulotni saqlash" }).click();
  await expect(page.getByText("Mahsulot qoʻshildi")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/products?q=парацетамол");
  await expect(page.getByRole("cell", { name: "Paracetamol E2E 500 mg" })).toBeVisible();

  // Narx: NO → o'tkazish → amaldagi narx
  await page.goto("/prices");
  await page.getByRole("button", { name: "Narx oʻrnatish" }).click();
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await choose(page, "Narx turi", /^Narx$/);
  await field(page, "Yangi narx").first().fill("2500");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Narxlar kuchga kirdi")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByRole("cell", { name: "2.500,00" })).toBeVisible();
});

test("CEO: boshlangʻich qoldiq (BQ) → Qoldiqlar", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/opening");
  await page.getByRole("button", { name: "Qoldiq kiritish" }).first().click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await choose(page, "Zona", /Asosiy saqlash/);
  await field(page, "Partiya").fill("E2E-01");
  await field(page, "Yaroqlilik").fill("31.12.2029");
  await field(page, "Soni").fill("120");
  await field(page, "Tannarx (1 dona)").fill("1.800,50");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: "E2E-01" })).toBeVisible();
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Qoldiq omborga kirdi")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/stock");
  const row = page.getByRole("row", { name: /Paracetamol E2E/ });
  await expect(row).toContainText("E2E-01");
  await expect(row).toContainText("120");
  await expect(row).toContainText("1.800,50");
});

test("CEO: kirim — qoralama → qabul (kam keldi) → oʻtkazish → Qoldiqlar", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  // Yetkazib beruvchi
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Yetkazib beruvchi qoʻshish" }).click();
  await field(page, "STIR / JShShIR").fill("309876543");
  await field(page, "Nomi").fill("Pharm Supply E2E");
  await page.getByRole("button", { name: "Kartani saqlash" }).click();
  await expect(page.getByText("Kontragent qoʻshildi")).toBeVisible();
  await page.keyboard.press("Escape");

  // Qoralama
  await page.goto("/receipts");
  await page.getByRole("button", { name: "Kirim qoʻshish" }).click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Yetkazib beruvchi", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Pharm");
  await page.getByRole("option", { name: /Pharm Supply E2E/ }).click();
  await field(page, "Yuk xati raqami").fill("YX-501");
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await choose(page, "Zona", /Asosiy saqlash/);
  await field(page, "Partiya").fill("KR-E2E");
  await field(page, "Yaroqlilik").fill("30.06.2029");
  await field(page, "Soni").fill("50");
  await field(page, "Aksiya bonusi").fill("5");
  await field(page, "Faktura narxi (1 dona)").fill("2.000");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();

  // Qabul: 48 ta keldi — «Kam keldi»
  await page.getByRole("button", { name: "Qabul qilish" }).click();
  const accept = page.getByRole("dialog", { name: "Tovarni qabul qilish" });
  await accept.getByLabel(/^Yaroqli\s*\*?$/).fill("48");
  await accept.getByRole("button", { name: "Qabulni tasdiqlash" }).click();
  await expect(page.getByText("Tovar Qabul zonasida — sotuvga yopiq")).toBeVisible();

  // Oʻtkazish: haqiqiy soni boʻyicha
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  const postDialog = page.getByRole("dialog", { name: "Kirimni oʻtkazish" });
  await postDialog.getByText("Haqiqiy soni boʻyicha").click();
  await postDialog.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Kirim oʻtkazildi")).toBeVisible();
  await expect(page.getByText("qarz 96.000,00 soʻm")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/stock");
  await field(page, "Qidirish").fill("Paracetamol E2E");
  await expect(page.getByRole("row", { name: /KR-E2E-B/ })).toContainText("5");
  await expect(page.getByRole("row", { name: /KR-E2E(?!-B)/ }).first()).toContainText("48");
});

test("CEO: buyurtma — mijoz, mahsulot, muammolar paneli, navbatga yuborish", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/customers");
  await page.getByRole("button", { name: "Mijoz qoʻshish" }).click();
  await field(page, "STIR / JShShIR").fill("305551234");
  await field(page, "Nomi").fill("Shifo Dorixona E2E");
  await page.getByRole("button", { name: "Kartani saqlash" }).click();
  await expect(page.getByText("Kontragent qoʻshildi")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Shifo");
  await page.getByRole("option", { name: /Shifo Dorixona E2E/ }).click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("10");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await expect(page.getByText("Muammo yoʻq — buyurtmani yuborish mumkin")).toBeVisible();
  await expect(page.getByText("25.000,00 soʻm")).toBeVisible();

  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();
  await expect(page.getByText("Navbatda — ombor yigʻishga tayyorlaydi")).toBeVisible();

  // Vaqt berish → yigʻish → hisobdan oʻtkazish
  await field(page, "Yigʻish vaqti").fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByText("Vaqt berildi")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/picking");
  await page.getByRole("button", { name: "Yigʻishni boshlash" }).first().click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByText("Olindi").first().click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();

  await page.goto("/orders");
  await page.getByRole("cell", { name: "Shifo Dorixona E2E" }).first().click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  await page.getByText("Tekshirildi").first().click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
  await page.keyboard.press("Escape");

  // Ombor monitori: buyurtma «Hujjatlashtirilmoqda» ustunida
  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Ombor monitori" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Hujjatlashtirilmoqda" })).toContainText("Shifo Dorixona E2E");

  // Joʻnatish: buyurtma reysga tayyor
  await page.goto("/shipments");
  await expect(page.getByRole("region", { name: "Joʻnatishga tayyor" })).toContainText("Shifo Dorixona E2E");
  await expect(page.getByRole("button", { name: "Reysni rejalashtirish" })).toBeDisabled();
});

test("CEO: Kassa — kirim, katta chiqim tasdiqqa → tasdiqlash, kunni yopish", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cash");
  await page.getByRole("button", { name: /^Filial:/ }).click();
  await page.getByRole("option").nth(1).click();
  await expect(page.getByRole("heading", { name: "Kassa" })).toBeVisible();

  // Boshqa kirim — darhol oʻtkaziladi
  await page.getByRole("button", { name: "Kirim / chiqim" }).click();
  await choose(page, "Yoʻnalish", /^Kirim$/);
  await choose(page, "Hisob", /Asosiy kassa/);
  await choose(page, "Kirim moddasi", /Boshqa kirim/);
  await field(page, "Summa").fill("3.000.000,00");
  await page.getByRole("button", { name: "Yozish" }).click();
  await expect(page.getByText("Kirim yozildi").first()).toBeVisible();

  // 2 000 000 dan katta chiqim — tasdiqqa; Direktor tasdiqlaydi
  await page.getByRole("button", { name: "Kirim / chiqim" }).click();
  await choose(page, "Hisob", /Asosiy kassa/);
  await choose(page, "Xarajat moddasi", /Ijara/);
  await field(page, "Summa").fill("2.500.000,00");
  await field(page, "Summa").press("Tab");
  await page.getByRole("button", { name: "Tasdiqqa yuborish" }).click();
  await expect(page.getByText("Chiqim tasdiqqa yuborildi").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: /Tasdiqlashni kutmoqda/ })).toBeVisible();
  await page.getByRole("button", { name: "Tasdiqlash" }).click();
  await expect(page.getByText("Chiqim tasdiqlandi").first()).toBeVisible();
  await expect(page.getByText("500.000,00 soʻm").first()).toBeVisible();

  // Kunni yopish: 2 × 200 000 + 1 × 100 000 = kutilgan 500 000 — farqsiz
  await page.getByRole("button", { name: "Kunni yopish" }).first().click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Kutilgan qoldiq")).toBeVisible();
  await field(page, "200.000 soʻm").fill("2");
  await field(page, "100.000 soʻm").fill("1");
  await drawer.getByRole("button", { name: "Kunni yopish" }).click();
  await expect(page.getByText(/Kun yopildi/).first()).toBeVisible();
  await page.getByRole("tab", { name: "Yopilgan kunlar" }).click();
  await expect(page.getByRole("cell", { name: "500.000,00" }).first()).toBeVisible();
});
