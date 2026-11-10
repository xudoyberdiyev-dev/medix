import { expect, test, type Locator, type Page } from "@playwright/test";

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
/** Xodim qoʻshilganda «Kirish maʼlumotlari» oynasidagi bir martalik parollar (testlar ketma-ket, workers: 1). */
const TEMP: Record<string, string> = {};
const PASSWORD = "Rol-parol-2026";
const CUSTOMER = "Baraka Dorixona E2E";
const PLATE = "01 E 777 EE";

const STAFF = [
  { name: "Olim Omborov", login: "keeper.1", role: /^Ombor mudiri$/ },
  { name: "Yusuf Yigʻuvchiyev", login: "picker.1", role: /^Yig.uvchi$/ },
  { name: "Mavluda Markirovkachi", login: "marker.1", role: /^Markirovkachi$/ },
  { name: "Hasan Haydovchiyev", login: "driver.1", role: /^Haydovchi$/ },
  { name: "Komila Kassirova", login: "cashier.1", role: /^Kassir$/ },
  { name: "Farrux Rahbarov", login: "manager.1", role: /^Filial rahbari$/ },
  { name: "Xurshida Xaridova", login: "buyer.1", role: /^Xarid$/ },
  // E3 (07.11): Buxgalter standart holatda faqat oʻz filiali; barcha filiallarni Direktor beradi (pastda)
  { name: "Botir Buxgalterov", login: "accountant.1", role: /^Buxgalter$/ },
] as const;

/** Markirovkali mahsulot: EAN-13 shtrix-kodi = koddagi GTIN (01). */
const MARKED = "Amoksitsillin E2E 250 mg";
const BARCODE = "4780000000014";
const mark = (serial: string) => `(01)0${BARCODE}(21)${serial}(17)291231(10)MK-01(91)D`;

/** 1×1 PNG — yetkazish rasmi uchun. */
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

async function login(page: Page, login: string, password: string) {
  await page.goto("/login");
  await field(page, "Login").fill(login);
  await field(page, "Parol").fill(password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
}

/** Birinchi kirish: vaqtinchalik parol → doimiy parol → bosh sahifa. */
async function firstLogin(page: Page, user: string) {
  await login(page, user, TEMP[user] ?? "");
  await expect(page).toHaveURL(/\/password/);
  await field(page, "Yangi parol").fill(PASSWORD);
  await field(page, "Yangi parolni takrorlang").fill(PASSWORD);
  await page.getByRole("button", { name: "Parolni saqlash" }).click();
  await page.getByRole("button", { name: "Davom etish" }).click();
  await expect(page).toHaveURL(/\/$/);
}

async function choose(page: Page, label: string, option: RegExp) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

async function pick(page: Page, scope: Locator, label: string, option: RegExp) {
  await scope.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("option", { name: option }).first().click();
}

/** Sozlamalar → Xodimlar (prototip AdminStaff/WizStaff paneli): xodim qoʻshadi, bir martalik parolni eslab qoladi. */
async function addStaff(page: Page, s: { name: string; login: string; role: RegExp; phone: string; branch?: RegExp }) {
  const [first, last] = s.name.split(" ");
  await page.getByRole("button", { name: "Xodim qoʻshish" }).first().click();
  const panel = page.getByRole("dialog", { name: "Yangi xodim" });
  await field(panel, "Familiya").fill(last);
  await field(panel, "Ism").fill(first);
  await field(panel, "Telefon").fill(s.phone);
  await pick(page, panel, "Rol", s.role);
  if (s.branch) await pick(page, panel, "Filial", s.branch);
  await field(panel, "Login").fill(s.login);
  await panel.getByRole("button", { name: "Saqlash", exact: true }).click();
  const creds = page.getByRole("dialog", { name: "Kirish maʼlumotlari" });
  await expect(creds.getByText(s.login, { exact: true })).toBeVisible();
  TEMP[s.login] = ((await creds.locator(".font-mono").nth(1).textContent()) ?? "").trim();
  await creds.getByRole("button", { name: "Tayyor" }).click();
  await expect(page.getByRole("cell", { name: s.login, exact: true })).toBeVisible();
}

test("CEO: ombor, yigʻuvchi, haydovchi va kassir xodimlari, mashina, mijoz", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/settings/employees");
  for (const [i, s] of STAFF.entries()) {
    await addStaff(page, { ...s, phone: `9180000${String(i).padStart(2, "0")}`, branch: /Toshkent/ });
  }
  // E3: Direktor Buxgalterga barcha filiallar doirasini beradi (audit bilan) — xodim kartasida
  await page.getByRole("cell", { name: "accountant.1", exact: true }).click();
  await page.getByRole("button", { name: "Yana" }).click();
  await page.getByRole("menuitem", { name: "Barcha filiallarga ruxsat berish" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Barcha filiallarga ruxsat berish" }).click();
  await expect(page.getByText("Barcha filiallar ruxsati berildi").first()).toBeVisible();
  await expect(page.getByText("Barcha filiallar", { exact: true }).first()).toBeVisible();

  // Markirovkali mahsulot: karta → narx (NO) → boshlangʻich qoldiq (BQ)
  await page.goto("/products");
  await page.getByRole("button", { name: "Mahsulot qoʻshish" }).first().click();
  await field(page, "Mahsulot nomi").fill(MARKED);
  await field(page, "Shartnomadagi nomi").fill("Амоксициллин капсулы 250 мг");
  await field(page, "Klassifikator nomi").fill("Amoksitsillin");
  await choose(page, "Ishlab chiqaruvchi", /Nobel E2E/);
  await choose(page, "Kategoriya", /Analgetiklar E2E/);
  await field(page, "IKPU kodi").fill("03004001001000001");
  await field(page, "Farm ID").fill("FRM-0000002");
  await field(page, "Shtrix-kodlar").fill(BARCODE);
  await field(page, "Shtrix-kodlar").press("Enter");
  await page.getByRole("switch", { name: "Markirovka majburiy" }).click();
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Mahsulot saqlandi")).toBeVisible();

  await page.goto("/prices");
  await page.getByRole("button", { name: "Narx oʻrnatish" }).click();
  await expect(page).toHaveURL(/\/prices\/set/);
  await page.getByRole("searchbox", { name: "Qidiruv" }).fill("Amoksitsillin");
  await page.getByRole("textbox", { name: /Yangi narx \(QQS bilan\) — Amoksitsillin E2E/ }).fill("5000");
  await page.getByRole("button", { name: "Saqlash" }).first().click();
  await page.getByRole("dialog", { name: "Narxlarni saqlash" }).getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText(/Saqlandi: NO-[A-Z]{3}-\d{6} — 1 ta narx/)).toBeVisible();

  await page.goto("/opening");
  await page.getByRole("button", { name: "Yangi hujjat" }).click();
  await page.getByRole("menuitem", { name: /Tovar qoldigʻi/ }).click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Amoksitsillin");
  await page.getByRole("option", { name: /Amoksitsillin E2E/ }).click();
  await choose(page, "Zona", /Asosiy saqlash/);
  await field(page, "Partiya").fill("MK-01");
  await field(page, "Yaroqlilik").fill("31.12.2029");
  await field(page, "Soni").fill("20");
  await field(page, "Tannarx (1 dona)").fill("3.000");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Qoldiq omborga kirdi")).toBeVisible();
  await page.keyboard.press("Escape");

  // Mashina (filial doirasida; E6: sigʻim yoʻq — faqat «Muzlatkichi bor» belgisi)
  await page.goto("/dictionaries?tab=vehicles");
  await page.getByRole("button", { name: "Mashina qoʻshish" }).click();
  await choose(page, "Filial", /Toshkent/);
  await field(page, "Davlat raqami").fill(PLATE);
  await field(page, "Model").fill("Damas");
  await expect(page.getByLabel(/Sigʻimi/)).toHaveCount(0);
  await page.getByText("Muzlatkichi bor", { exact: true }).click();
  await page.getByRole("button", { name: "Mashinani saqlash" }).click();
  await expect(page.getByText("Mashina qoʻshildi").first()).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "Damas" }).first()).toContainText("Bor");
  await page.keyboard.press("Escape");

  // Mijoz
  await page.goto("/customers");
  await page.getByRole("button", { name: "Mijoz qoʻshish" }).first().click();
  await field(page, "STIR / JShShIR").fill("305559876");
  await field(page, "Nomi").fill(CUSTOMER);
  await choose(page, "Turi", /Dorixona/);
  await field(page, "Litsenziya raqami").fill("FA-E2E-1");
  await field(page, "Amal qilish muddati").fill("31.12.2030");
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

test("CEO: Import ustasi — CSV dan mahsulotlar (xato qator oʻtkazib yuboriladi)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/products");
  await page.getByRole("button", { name: "Import" }).first().click();
  await expect(page).toHaveURL(/\/products\/import$/);
  const csv = [
    "SMARTUP eksport",
    "Наименование;МНН;Производитель;Группа;ИКПУ;Farm ID;Штрих-код",
    "Import E2E Ibuprofen 200;Ibuprofen;Nobel E2E;Analgetiklar E2E;03004001001000002;FRM-IMP-1;",
    "Import E2E Sitramon;Sitramon;Nobel E2E;Analgetiklar E2E;123;FRM-IMP-2;",
  ].join("\r\n");
  await page.getByTestId("import-file").setInputFiles({ name: "smartup.csv", mimeType: "text/csv", buffer: Buffer.from(csv, "utf8") });
  await expect(page.locator("section").getByText("smartup.csv")).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  // Sarlavha qatori avtomatik taxmin qilinadi (2-qator)
  await expect(page.getByRole("textbox", { name: "Sarlavha qatori" })).toHaveValue("2");
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.getByText("Nom boʻyicha avtomatik moslashtirildi: 7 / 21 maydon")).toBeVisible();
  await page.getByRole("button", { name: "Moslashtirishni saqlash" }).click();
  await expect(page.getByText(/profili saqlandi/)).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.locator("tr[data-row='2']")).toContainText("IKPU 17 ta raqam boʻlishi kerak");
  await expect(page.locator("tr[data-row='1']")).toContainText("Yangi · kod avtomatik");
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.getByText("1 ta mahsulot yaratiladi, 1 ta xato qator oʻtkazib yuboriladi")).toBeVisible();
  await page.getByRole("button", { name: "1 ta mahsulotni yaratish" }).click();
  await expect(page.getByText("1 ta mahsulot yaratildi, 1 ta qator oʻtkazib yuborildi").first()).toBeVisible();
  await expect(page).toHaveURL(/\/products$/);
});

test("Operator: naqd toʻlovli buyurtma kiritadi va navbatga yuboradi", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await choose(page, "Toʻlov turi", /^Naqd/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("4");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Amoksitsillin");
  await page.getByRole("option", { name: /Amoksitsillin E2E/ }).click();
  await field(page, "Miqdor").first().fill("2");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await expect(page.locator(`dl[aria-label="Jami"]`).getByText("20.000,00", { exact: true }).last()).toBeVisible();
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
  await field(page, "Markirovka vaqti").fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByRole("status").getByText("Vaqt berildi", { exact: true })).toBeVisible();
});

test("Yigʻuvchi: birinchi kirish, buyurtmani yigʻadi", async ({ page }) => {
  await firstLogin(page, "picker.1");
  await page.goto("/picking");
  await page.getByRole("button", { name: "Yigʻishni boshlash" }).first().click();
  await expect(page.getByRole("timer")).toBeVisible();
  for (const c of await page.getByText("Olindi", { exact: true }).all()) await c.click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();
  // Yigʻuvchiga Kassa yopiq
  await expect(page.getByRole("link", { name: "Kassa" })).toHaveCount(0);
});

test("Markirovkachi: birinchi kirish, kodlarni skanerlaydi (xato kod rad etiladi)", async ({ page }) => {
  await firstLogin(page, "marker.1");
  await page.goto("/marking");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  await page.getByRole("listitem").filter({ hasText: CUSTOMER }).first().getByRole("button", { name: "Markirovkani boshlash" }).click();
  const scan = page.getByLabel("Markirovka kodi");
  await expect(scan).toBeFocused();
  // Boshqa partiya — rad etiladi
  await scan.fill(mark("S0").replace("MK-01", "XX-99"));
  await scan.press("Enter");
  await expect(page.getByText(/^Partiya mos emas/).first()).toBeVisible();
  for (const serial of ["S1", "S2"]) {
    await scan.fill(mark(serial));
    await scan.press("Enter");
  }
  // Takror kod — rad etiladi
  await scan.fill(mark("S1"));
  await scan.press("Enter");
  await expect(page.getByText(/shu buyurtmada allaqachon skanerlangan/).first()).toBeVisible();
  await expect(page.getByText("2 / 2").first()).toBeVisible();
  // E1: aralash buyurtma — kodlar toʻliq, lekin markirovkasiz qator (Paracetamol) tasdiqlanmaguncha yakunlab boʻlmaydi
  await expect(page.getByRole("button", { name: "Markirovkani yakunlash" })).toBeDisabled();
  const unmarked = page.getByRole("region", { name: "Markirovkasiz qatorlar" });
  await expect(unmarked).toContainText("Paracetamol E2E");
  await unmarked.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(unmarked.getByText("Tasdiqlandi")).toBeVisible();
  await page.getByRole("button", { name: "Markirovkani yakunlash" }).click();
  await expect(page.getByText("Markirovka yakunlandi").first()).toBeVisible();
});

test("Ombor mudiri: hisobdan oʻtkazadi va reys tuzadi", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("region", { name: "Hisobdan oʻtkazilmoqda" }).getByText(CUSTOMER).click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  for (const c of await page.getByText("Tekshirildi", { exact: true }).all()) await c.click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
  await page.keyboard.press("Escape");

  // Joʻnatish: buyurtma «Tayyor» — yetkazish, hudud boʻyicha jadvalda
  await page.goto("/shipments");
  await expect(page.getByRole("region", { name: "Yetkazish" })).toContainText(CUSTOMER);
  // Reys — faqat Ombor mudiri paneli «Hujjatlashtirish» yorligʻida (prototip)
  await page.goto("/warehouse?tab=docs");
  const ready = page.getByRole("region", { name: "Joʻnatishga tayyor" });
  await ready.getByRole("listitem").filter({ hasText: CUSTOMER }).getByText("Reysga").click();
  await choose(page, "Mashina", /01 E 777 EE/);
  await choose(page, "Haydovchi", /Hasan Haydovchiyev/);
  await page.getByRole("button", { name: "Reysni rejalashtirish" }).click();
  await expect(page.getByText(/^Reys RS-.* rejalashtirildi$/).first()).toBeVisible();
  await page.goto("/shipments?tab=trips");
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
  await field(page, "Naqd olindi").fill("20.000,00");
  await page.getByRole("button", { name: "Yetkazildi", exact: true }).click();
  await page.getByRole("button", { name: "Reysni yakunlash" }).click();
  await expect(page.getByText("Reys yakunlandi").first()).toBeVisible();
});

test("Kassir: haydovchidagi pulni qabul qiladi (MT)", async ({ page }) => {
  await firstLogin(page, "cashier.1");
  await page.goto("/cash");
  await expect(page.getByRole("heading", { name: "Haydovchilardan kutilayotgan pul" })).toBeVisible();
  await expect(page.getByText(CUSTOMER).first()).toBeVisible();
  await page.getByRole("button", { name: "Qabul qilish", exact: true }).first().click();
  // Kassir faqat oʻz kassasida: tanlovda faqat «Kassa 2» (Asosiy kassada esa CEO kunni yopgan)
  await expect(page.getByRole("combobox", { name: "Qabul qilinadigan kassa", exact: true })).toHaveText(/Kassa 2/);
  await page.getByRole("button", { name: "Pulni qabul qilish" }).click();
  await expect(page.getByText("Pul qabul qilindi").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Haydovchilardan kutilayotgan pul" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Kassa 2.*20\.000,00/ })).toBeVisible();
  // Kassir hisob qoʻsha olmaydi
  await expect(page.getByRole("button", { name: "Hisob qoʻshish" })).toHaveCount(0);
});

test("Haydovchi: pul topshirilgach reys «Yakunlangan reyslar»da", async ({ page }) => {
  await login(page, "driver.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/driver");
  // Boshqa spec'lardagi reyslar faol boʻlishi mumkin — faqat tarix yorligʻi tekshiriladi
  await page.getByRole("tab", { name: "Yakunlangan reyslar" }).click();
  await expect(page.getByText("Yakunlangan", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/RS-[A-Z]{3}-\d{6}/).first()).toBeVisible();
});

test("Operator: buyurtma «Yetkazildi» holatida", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Yetkazildi/ }).click();
  await expect(page.getByRole("cell", { name: CUSTOMER }).first()).toBeVisible();
});

test("CEO: Paracetamol uchun maksimal miqdor — 5", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/products?q=Paracetamol E2E");
  await page.getByRole("cell", { name: "Paracetamol E2E 500 mg" }).click();
  // Kartochka — toʻliq sahifa; tahrirlash
  await expect(page).toHaveURL(/\/products\/\d+$/);
  await page.getByRole("button", { name: "Tahrirlash" }).click();
  await field(page, "Maksimal miqdor").fill("5");
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Mahsulot saqlandi").first()).toBeVisible();
});

test("Operator: maksimaldan koʻp — buyurtma Filial rahbari tasdigʻiga ketadi", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Paracetamol");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("8");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  // Saqlangach /orders/<id> ga oʻtadi — oldingi (yashirin) sahifadagi tugmani bosmaslik uchun
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma tasdiqqa yuborildi")).toBeVisible();
});

test("Filial rahbari: birinchi kirish, buyurtmani tasdiqlaydi", async ({ page }) => {
  await firstLogin(page, "manager.1");
  await page.goto("/orders");
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Tasdiqlashda/ }).click();
  await page.getByRole("cell", { name: CUSTOMER }).first().click();
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText("Tasdiqlandi — navbatga oʻtdi").first()).toBeVisible();
});

test("Kassir: oʻz kassasiga kirim va katta chiqim — tasdiqqa", async ({ page }) => {
  await login(page, "cashier.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cash");
  await page.getByRole("button", { name: "Kassa operatsiyasi" }).click();
  await expect(page).toHaveURL(/\/cash\/ops\/new\?kind=ko/);
  await page.getByRole("radio", { name: "Kirim" }).click();
  await choose(page, "Kassa", /Kassa 2/);
  await choose(page, "Kirim moddasi", /Boshqa kirim/);
  await field(page, "Summa").fill("3.000.000,00");
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Kirim yozildi").first()).toBeVisible();
  await expect(page).toHaveURL(/\/cash$/);

  await page.getByRole("button", { name: "Kassa operatsiyasi" }).click();
  await choose(page, "Kassa", /Kassa 2/);
  await choose(page, "Xarajat moddasi", /Ijara/);
  await field(page, "Summa").fill("2.500.000,00");
  await field(page, "Summa").press("Tab");
  await page.getByRole("button", { name: "Tasdiqqa yuborish" }).click();
  await expect(page.getByText("Chiqim tasdiqqa yuborildi").first()).toBeVisible();
  // Kassir oʻzi tasdiqlay olmaydi
  await expect(page.getByRole("button", { name: "Tasdiqlash", exact: true })).toHaveCount(0);
});

test("Filial rahbari: kassirning katta chiqimini tasdiqlaydi", async ({ page }) => {
  await login(page, "manager.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cash");
  await expect(page.getByRole("heading", { name: /Tasdiqlashni kutmoqda/ })).toBeVisible();
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText("Chiqim tasdiqlandi").first()).toBeVisible();
  // 20 000 (haydovchidan) + 3 000 000 − 2 500 000 = 520 000
  await expect(page.getByRole("button", { name: /Kassa 2.*520\.000,00/ })).toBeVisible();
});

test("Xarid: birinchi kirish, kirim qoralamasini kiritadi (qabul qila olmaydi)", async ({ page }) => {
  await firstLogin(page, "buyer.1");
  await page.goto("/receipts");
  await page.getByRole("button", { name: "Yangi kirim" }).click();
  await choose(page, "Ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Yetkazib beruvchi", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Pharm");
  await page.getByRole("option", { name: /Pharm Supply E2E/ }).click();
  await field(page, "Yuk xati raqami").fill("YX-777");
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Paracetamol");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await choose(page, "Zona", /Asosiy saqlash/);
  await field(page, "Partiya").fill("KR-X1");
  await field(page, "Yaroqlilik").fill("30.06.2029");
  await field(page, "Soni").fill("30");
  await field(page, "Faktura narxi (1 dona)").fill("2.000");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await expect(page.getByRole("button", { name: "Qabul qilish" })).toHaveCount(0);
});

test("Ombor mudiri: kirimni qabul qiladi (narxni koʻrmaydi)", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Kirim qabuli/ }).click();
  await page.getByRole("cell", { name: "YX-777" }).click();
  await expect(page.getByText("60.000,00")).toHaveCount(0);
  await page.getByRole("button", { name: "Qabul qilish" }).click();
  const accept = page.getByRole("dialog", { name: "Tovarni qabul qilish" });
  await accept.getByLabel(/^Yaroqli\s*\*?$/).fill("30");
  await accept.getByRole("button", { name: "Qabulni tasdiqlash" }).click();
  await expect(page.getByText("Tovar Qabul zonasida — sotuvga yopiq")).toBeVisible();
});

test("Buxgalter: birinchi kirish, kirimni oʻtkazadi (YB qarzi)", async ({ page }) => {
  await firstLogin(page, "accountant.1");
  await page.goto("/receipts");
  await page.getByRole("cell", { name: "YX-777" }).click();
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Kirim oʻtkazildi").first()).toBeVisible();
});

test("Kassir: YB ga toʻlov (YT) — tasdiqqa", async ({ page }) => {
  await login(page, "cashier.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/payments");
  await page.getByRole("button", { name: "Yetkazib beruvchiga toʻlov" }).first().click();
  await expect(page).toHaveURL(/\/payments\/yt\/new$/);
  await page.getByRole("combobox", { name: "Yetkazib beruvchi", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Pharm");
  await page.getByRole("option", { name: /Pharm Supply E2E/ }).click();
  await choose(page, "Kassa", /Kassa 2/);
  await field(page, "Summa").fill("60.000,00");
  await page.getByRole("button", { name: "Tasdiqlashga yuborish" }).first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Tasdiqlashga yuborish" }).click();
  await expect(page.getByText(/tasdiqlashga yuborildi/).first()).toBeVisible();
  await expect(page).toHaveURL(/\/payments\/yt\/\d+$/);
  await expect(page.getByText(/Filial rahbari tasdigʻini kutmoqda/)).toBeVisible();
});

test("Filial rahbari: YT ni tasdiqlaydi va oʻtkazadi", async ({ page }) => {
  await login(page, "manager.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/payments");
  await page.getByRole("tab", { name: /Yetkazib beruvchilarga/ }).click();
  await page.getByRole("cell", { name: "Pharm Supply E2E" }).first().click();
  await expect(page).toHaveURL(/\/payments\/yt\/\d+$/);
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText(/tasdiqlandi$/).first()).toBeVisible();
  await expect(page.getByText(/Tasdiqlangan toʻlov tahrirlanmaydi/)).toBeVisible();
  await page.goto("/cash");
  // 520 000 − 60 000 = 460 000
  await expect(page.getByRole("button", { name: /Kassa 2.*460\.000,00/ })).toBeVisible();
});

/** E1: Markirovkachi markirovkasiz buyurtmani boshlaydi, qatorlarni tasdiqlaydi va yakunlaydi. */
async function confirmUnmarked(page: Page, customer: string) {
  await page.goto("/marking");
  await page.getByRole("tab", { name: /Navbat/ }).click();
  const card = page.getByRole("listitem").filter({ hasText: customer }).first();
  await expect(card).toContainText("Markirovkasiz — tasdiqlash");
  await card.getByRole("button", { name: "Markirovkani boshlash" }).click();
  const unmarked = page.getByRole("region", { name: "Markirovkasiz qatorlar" });
  await expect(unmarked).toBeVisible();
  await expect(page.getByLabel("Markirovka kodi")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Markirovkani yakunlash" })).toBeDisabled();
  for (const b of await unmarked.getByRole("button", { name: "Tasdiqlash", exact: true }).all()) await b.click();
  await expect(unmarked.getByText("Tasdiqlandi").first()).toBeVisible();
  await page.getByRole("button", { name: "Markirovkani yakunlash" }).click();
  await expect(page.getByText("Markirovka yakunlandi").first()).toBeVisible();
}

/** Ombor zanjiri: Ombor mudiri vaqt beradi → Yigʻuvchi yigʻadi → Ombor mudiri hisobdan oʻtkazadi va reys tuzadi. */
async function warehouseChain(page: Page) {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Vaqt berish/ }).click();
  await page.getByRole("list", { name: "Vaqt berilmagan buyurtmalar" }).getByText(CUSTOMER).click();
  await field(page, "Yigʻish vaqti").fill("15");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByRole("status").getByText("Vaqt berildi", { exact: true })).toBeVisible();

  const picker = await page
    .context()
    .browser()!
    .newPage({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  await login(picker, "picker.1", PASSWORD);
  await expect(picker).toHaveURL(/\/$/);
  await picker.goto("/picking");
  await picker.getByRole("button", { name: "Yigʻishni boshlash" }).first().click();
  await expect(picker.getByRole("timer")).toBeVisible();
  for (const c of await picker.getByText("Olindi", { exact: true }).all()) await c.click();
  await picker.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(picker.getByText("Yigʻish yakunlandi")).toBeVisible();
  // E1: markirovkasiz buyurtma ham Markirovkachidan «Tasdiqlash» bilan oʻtadi
  await login(picker, "marker.1", PASSWORD);
  await expect(picker).toHaveURL(/\/$/);
  await confirmUnmarked(picker, CUSTOMER);
  await picker.close();

  await page.goto("/warehouse");
  await page.getByRole("region", { name: "Hisobdan oʻtkazilmoqda" }).getByText(CUSTOMER).click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  for (const c of await page.getByText("Tekshirildi", { exact: true }).all()) await c.click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/warehouse?tab=docs");
  await page
    .getByRole("region", { name: "Joʻnatishga tayyor" })
    .getByRole("listitem")
    .filter({ hasText: CUSTOMER })
    .getByText("Reysga")
    .click();
  await choose(page, "Mashina", /01 E 777 EE/);
  await choose(page, "Haydovchi", /Hasan Haydovchiyev/);
  await page.getByRole("button", { name: "Reysni rejalashtirish" }).click();
  await expect(page.getByText(/^Reys RS-.* rejalashtirildi$/).first()).toBeVisible();
}

test("Ombor zanjiri: tasdiqlangan buyurtma — vaqt, yigʻish, hisobdan oʻtkazish, reys", async ({ page }) => {
  await warehouseChain(page);
});

test("Haydovchi: qisman yetkazadi (3 ta qaytdi)", async ({ page }) => {
  await login(page, "driver.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/driver");
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Qabul qildim" }).click();
  await page.getByRole("button", { name: "Yuklab boʻlindi — reysni boshlash" }).click();
  await expect(page.getByText("Reys boshlandi").first()).toBeVisible();
  await page.getByLabel(`Rasm: ${CUSTOMER}`).setInputFiles({ name: "qisman.png", mimeType: "image/png", buffer: PNG });
  await expect(page.getByText("Rasm: 1")).toBeVisible();
  await page.getByRole("button", { name: "Qisman", exact: true }).click();
  const modal = page.getByRole("dialog", { name: `Qisman yetkazish · ${CUSTOMER}` });
  await modal
    .getByLabel(/^Qaytdi\s*\*?$/)
    .first()
    .fill("3");
  await modal.getByLabel(/^Sabab\s*\*?$/).fill("Mijoz 5 ta oldi");
  const cash = modal.getByLabel(/^Naqd olindi\s*\*?$/);
  if (await cash.count()) await cash.fill("12.500,00");
  await modal.getByRole("button", { name: "Qisman yetkazildi deb belgilash" }).click();
  await expect(page.getByText("Qisman yetkazildi").first()).toBeVisible();
  await expect(page.getByText(/Qaytgan tovar: 7\.500,00 soʻm/).first()).toBeVisible();
  await page.getByRole("button", { name: "Reysni yakunlash" }).click();
  await expect(page.getByText("Reys yakunlandi").first()).toBeVisible();
});

test("Ombor mudiri: qaytgan tovarni Karantinga qabul qiladi", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Qaytgan tovar/ }).click();
  const item = page.getByRole("listitem").filter({ hasText: CUSTOMER }).filter({ hasText: "kutilmoqda 3 ta" });
  await item.getByLabel(/^Keldi\s*\*?$/).fill("3");
  await item.getByRole("button", { name: "Qabul qilish" }).click();
  await expect(page.getByText("Qaytgan tovar Karantinga qabul qilindi").first()).toBeVisible();
});

test("CEO: Direktor xodimi va mijozga kichik kredit limiti", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/settings/employees");
  await addStaff(page, { name: "Dilshod Direktorov", login: "director.1", role: /^Direktor$/, phone: "918009900" });

  await page.goto("/customers");
  await page.getByRole("cell", { name: CUSTOMER }).first().click();
  await page.getByRole("tab", { name: /^Filiallar boʻyicha shartlar/ }).click();
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: /Toshkent/ }) });
  await card.getByLabel(/^Kredit limiti\s*\*?$/).fill("1.000,00");
  await card.getByRole("button", { name: "Shartlarni saqlash" }).click();
  await expect(page.getByText("Filial shartlari saqlandi").first()).toBeVisible();
  // Kartochka hujjat yorliqlari (prototip CounterpartyCard)
  await page.getByRole("tab", { name: /^Buyurtmalar/ }).click();
  await expect(page.getByRole("link", { name: "Boʻlimga oʻtish" })).toBeVisible();
  await page.getByRole("tab", { name: /^Toʻlovlar/ }).click();
  await expect(page.getByRole("link", { name: "Boʻlimga oʻtish" })).toHaveAttribute("href", "/payments");
});

test("Operator: limitdan 20% dan koʻp oshgan buyurtma — Direktor tasdigʻiga", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Buyurtma kiritish" }).click();
  await page.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Paracetamol");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("2");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  // Saqlangach /orders/<id> ga oʻtadi — oldingi (yashirin) sahifadagi tugmani bosmaslik uchun
  await expect(page).toHaveURL(/\/orders\/\d+/);
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma tasdiqqa yuborildi")).toBeVisible();
  await expect(page.getByText("Direktor tasdigʻi kerak").first()).toBeVisible();
});

test("Filial rahbari: Direktor darajasidagi buyurtmani tasdiqlay olmaydi", async ({ page }) => {
  await login(page, "manager.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/orders");
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Tasdiqlashda/ }).click();
  await page.getByRole("cell", { name: CUSTOMER }).first().click();
  await expect(page.getByText("Direktor tasdigʻi kerak").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Tasdiqlash", exact: true })).toHaveCount(0);
});

test("Direktor: birinchi kirish, buyurtmani tasdiqlaydi", async ({ page }) => {
  await firstLogin(page, "director.1");
  await page.goto("/orders");
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Tasdiqlashda/ }).click();
  await page.getByRole("cell", { name: CUSTOMER }).first().click();
  await expect(page.getByText("Direktor tasdigʻi kerak").first()).toBeVisible();
  await page.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(page.getByText("Tasdiqlandi — navbatga oʻtdi").first()).toBeVisible();
});

test("Kassir: qisman reysdagi naqd pulni qabul qiladi — haydovchi yangi reysga boʻshaydi", async ({ page }) => {
  await login(page, "cashier.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/cash");
  await expect(page.getByRole("heading", { name: "Haydovchilardan kutilayotgan pul" })).toBeVisible();
  await page.getByRole("button", { name: "Qabul qilish", exact: true }).first().click();
  await page.getByRole("button", { name: "Pulni qabul qilish" }).click();
  await expect(page.getByText("Pul qabul qilindi").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Haydovchilardan kutilayotgan pul" })).toHaveCount(0);
});

test("Ombor zanjiri: Direktor tasdiqlagan buyurtma reysga chiqadi", async ({ page }) => {
  await warehouseChain(page);
});

test("Haydovchi: «Yetkazilmadi» (sabab bilan), reysni yakunlaydi", async ({ page }) => {
  await login(page, "driver.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/driver");
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Qabul qildim" }).click();
  await page.getByRole("button", { name: "Yuklab boʻlindi — reysni boshlash" }).click();
  await expect(page.getByText("Reys boshlandi").first()).toBeVisible();
  await page.getByRole("button", { name: "Yetkazilmadi", exact: true }).click();
  const modal = page.getByRole("dialog", { name: "Yetkazilmadi" });
  await modal.getByLabel(/^Sabab\s*\*?$/).fill("Dorixona yopiq");
  await modal.getByRole("button", { name: "Yetkazilmadi deb belgilash" }).click();
  await expect(modal).toBeHidden();
  await page.getByRole("button", { name: "Reysni yakunlash" }).click();
  await expect(page.getByText("Qaytgan tovar va naqd pulni topshiring").first()).toBeVisible();
});

test("Ombor mudiri: yetkazilmagan tovarni Karantinga qabul qiladi", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/warehouse");
  await page.getByRole("tab", { name: /^Qaytgan tovar/ }).click();
  const item = page.getByRole("listitem").filter({ hasText: CUSTOMER }).filter({ hasText: "kutilmoqda 2 ta" });
  await item.getByLabel(/^Keldi\s*\*?$/).fill("2");
  await item.getByRole("button", { name: "Qabul qilish" }).click();
  await expect(page.getByText("Qaytgan tovar Karantinga qabul qilindi").first()).toBeVisible();
});

test("Buxgalter: Savdo hisoboti va mijozlar qarzi", async ({ page }) => {
  await login(page, "accountant.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/reports");
  await page
    .getByRole("link", { name: /^Savdo/ })
    .first()
    .click();
  await expect(page.getByRole("heading", { name: "Savdo hisoboti" })).toBeVisible();
  await expect(page.getByText("Davrda savdo yoʻq")).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Excelʼga yuklab olish/ })).toBeVisible();
  // Mahsulotlar savdosi: sotilgan mahsulot qatori; kategoriya boʻyicha guruhlash
  await page.goto("/reports");
  await page.getByRole("link", { name: /^Mahsulotlar savdosi/ }).click();
  await expect(page.getByRole("heading", { name: "Mahsulotlar savdosi" })).toBeVisible();
  await expect(page.getByRole("cell", { name: /Paracetamol E2E/ }).first()).toBeVisible();
  await page.getByRole("tab", { name: "Kategoriya" }).click();
  await expect(page.getByRole("columnheader", { name: /Kategoriya/ })).toBeVisible();
  // Savdo: toʻlov turi boʻyicha guruhlash; Xarajatlar hisoboti ochiladi
  await page.goto("/reports/sales?groupBy=PAYMENT_TYPE");
  await expect(page.getByRole("columnheader", { name: /Toʻlov turi/ })).toBeVisible();
  await page.goto("/reports/expenses");
  await expect(page.getByRole("heading", { name: "Xarajatlar", level: 1 })).toBeVisible();
  // Qaytarishlar: katalogdan ochiladi, mijoz boʻyicha guruhlashda ulush ustuni
  await page.goto("/reports");
  await page.getByRole("link", { name: /^Qaytarishlar/ }).click();
  await expect(page.getByRole("heading", { name: "Qaytarishlar", level: 1 })).toBeVisible();
  await page.getByRole("tab", { name: "Mijoz" }).click();
  await expect(page.getByRole("columnheader", { name: /Mijoz/ })).toBeVisible();
  await expect(page.getByRole("main").getByText(/ruxsat|yuklanmadi/i)).toHaveCount(0);
  await page.goto("/debts/customers");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText(/ruxsat/i)).toHaveCount(0);
});

test("Operator: mijozdan qaytarish (QM) — sotuv asosida, Ombor mudiriga yuboradi", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/customer-returns");
  await expect(page.getByRole("heading", { name: "Mijozdan qaytarish", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Yangi qaytarish" }).first().click();
  const drawer = page.getByRole("dialog").last();
  await drawer.getByRole("combobox", { name: "Mijoz", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Baraka");
  await page.getByRole("option", { name: /Baraka Dorixona E2E/ }).click();
  await pick(page, drawer, "Asos — sotuv hujjati", /SV-/);
  await expect(drawer.getByText("Sotilgan", { exact: true })).toBeVisible();
  // Sababsiz — tasdiqlab boʻlmaydi
  await drawer
    .getByLabel(/Paracetamol E2E.*qaytarilayotgan miqdor/)
    .first()
    .fill("1");
  await drawer.getByRole("button", { name: "Qabul qilishga yuborish" }).click();
  await expect(drawer.getByText(/sabab tanlanmagan/)).toBeVisible();
  await drawer
    .getByRole("combobox", { name: /Paracetamol E2E.*: sabab/ })
    .first()
    .click();
  await page.getByRole("option", { name: "Shikastlangan" }).click();
  await drawer.getByRole("button", { name: "Qabul qilishga yuborish" }).click();
  await expect(page.getByText("Hujjat ombor mudiriga yuborildi").first()).toBeVisible();
  await expect(drawer.getByText("Qabul kutilmoqda").first()).toBeVisible();
});

test("Ombor mudiri: QM ni qabul qiladi — tovar Karantinga, mijoz qarzi kamayadi", async ({ page }) => {
  await login(page, "keeper.1", PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/customer-returns");
  const row = page.getByRole("row", { name: /QM-/ }).filter({ hasText: "Qabul kutilmoqda" }).first();
  await expect(row).toContainText(CUSTOMER);
  await row.click();
  const drawer = page.getByRole("dialog").last();
  await drawer.getByRole("button", { name: "Qabul qilish va tasdiqlash" }).click();
  const confirm = page.getByRole("dialog", { name: "Qaytarishni tasdiqlaysizmi?" });
  await expect(confirm.getByText(/Karantin zonasiga kiradi/)).toBeVisible();
  await confirm.getByRole("button", { name: "Qabul qilish va tasdiqlash" }).click();
  await expect(page.getByText(/QM-[A-Z]{2,4}-\d{6} tasdiqlandi/).first()).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /QM-/ }).first()).toContainText("Tasdiqlangan");
  // Qaytarish turlari yorligʻi: QM birinchi
  await expect(page.getByRole("tab", { name: "Mijozdan qaytarish" })).toBeVisible();
});
