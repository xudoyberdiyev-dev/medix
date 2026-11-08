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
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
}

/** Vaqtinchalik parol login sahifasidan xotirada — «Joriy parol» soʻralmaydi (prototip «Yangi parol oʻrnating»). */
async function changePassword(page: Page, current: string, next: string) {
  await expect(page).toHaveURL(/\/password/);
  await expect(field(page, "Joriy parol")).toHaveCount(0);
  await expect(page.getByText("Vaqtinchalik paroldan farq qiladi")).toBeVisible();
  await field(page, "Yangi parol").fill(current);
  await page.getByRole("button", { name: "Parolni saqlash" }).click();
  await expect(page.getByText("Parol talablarga javob bermaydi")).toBeVisible();
  await field(page, "Yangi parol").fill(next);
  await field(page, "Yangi parolni takrorlang").fill(next);
  await page.getByRole("button", { name: "Parolni saqlash" }).click();
  await expect(page.getByRole("heading", { name: "Parol saqlandi" })).toBeVisible();
  await page.getByRole("button", { name: "Davom etish" }).click();
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
  // Kompaniya sozlanmagan — Direktor avtomatik sozlash ustasiga o'tkaziladi (egasi talabi 08.11)
  await expect(page).toHaveURL(/\/setup$/);

  // 1. Kompaniya
  await expect(page.getByRole("heading", { name: "Kompaniya maʼlumotlari" })).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.getByText("Kompaniya nomini kiriting")).toBeVisible();
  await field(page, "Kompaniya nomi").fill("Medix Group");
  await page.getByRole("radio", { name: /Oʻzbekcha \(lotin\)/ }).click();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();

  // 2. Filial (prototip BranchPanel)
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.getByText("Davom etish uchun kamida bitta filial qoʻshing")).toBeVisible();
  await page.getByRole("button", { name: "Birinchi filialni qoʻshish" }).click();
  await page.getByRole("button", { name: "Filialni saqlash" }).click();
  await expect(page.getByText("6 ta maydonni toʻgʻrilang")).toBeVisible();
  await field(page, "Filial nomi").fill("Toshkent");
  await expect(field(page, "Qisqa belgi")).toHaveValue("TSH");
  await field(page, "Yuridik nomi").fill("Medix TSH MChJ");
  await field(page, "STIR").fill("301234567");
  await choose(page, "Viloyat / shahar", /Toshkent shahri/);
  await field(page, "Yuridik manzil").fill("Chilonzor tumani, 1-uy");
  await choose(page, "Bank", /Kapitalbank/);
  await field(page, "Hisob raqami").fill("20208000900100001010");
  await page.getByRole("button", { name: "Filialni saqlash" }).click();
  await expect(page.getByText("Medix TSH MChJ")).toBeVisible();
  await expect(page.getByText("1 ta hisob")).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();

  // 3. Ombor (prototip SetupWizard W3 + WarehousePanel)
  await expect(page.getByRole("heading", { name: "Omborlar va zonalar" })).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();
  await expect(page.getByText("Davom etish uchun kamida bitta ombor qoʻshing.")).toBeVisible();
  await page.getByRole("button", { name: "Ombor qoʻshish" }).first().click();
  await page.getByRole("button", { name: "Omborni saqlash" }).click();
  await expect(page.getByText("1 ta maydonni toʻgʻrilang")).toBeVisible();
  await field(page, "Ombor nomi").fill("Markaziy ombor");
  await expect(page.getByRole("checkbox", { name: /Filial manzili bilan bir xil/ })).toBeChecked();
  await page.getByRole("radio", { name: /Sovuq saqlash/ }).check();
  await page.getByRole("tab", { name: /Zonalar/ }).click();
  await expect(field(page, "Zona nomi")).toHaveCount(5);
  await page.getByRole("button", { name: "Omborni saqlash" }).click();
  const whRow = page.getByRole("button", { name: /Markaziy ombor/ });
  await expect(whRow).toBeVisible();
  await expect(whRow.getByText("Chilonzor tumani, 1-uy")).toBeVisible();
  await expect(page.getByText("1 ta ombor · 5 ta zona · 1 ta filialda")).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();

  // 4. Rollar va ruxsatlar — matritsa (prototip WizRoles): yangi rol Operatordan nusxa, amal yoqilsa koʻrish ham
  const matrix = page.getByTestId("roles-matrix");
  await expect(matrix).toBeVisible();
  await page.getByRole("button", { name: "Rol qoʻshish" }).click();
  await field(page, "Nomi").fill("Katta operator");
  await page.getByRole("dialog").getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("«Katta operator» roli qoʻshildi")).toBeVisible();
  await matrix.getByRole("button", { name: "Inventarizatsiya: yaratish · Katta operator" }).click();
  await expect(page.getByText("Shu boʻlimning «koʻrish» ruxsati ham yoqildi")).toBeVisible();
  await expect(page.getByText(/ta oʻzgarish/)).toBeVisible();
  await page.getByRole("button", { name: "Saqlash va davom etish" }).click();
  await expect(page.getByText("Rollar va ruxsatlar saqlandi")).toBeVisible();

  // 5. Xodim
  await field(page, "F.I.Sh.").fill("Dilshod Aliyev");
  await field(page, "Login").fill("operator.1");
  await choose(page, "Rol", /^Operator$/);
  await choose(page, "Filial", /Toshkent/);
  await field(page, "Vaqtinchalik parol").fill(OPERATOR_TEMP);
  await page.getByRole("button", { name: "Xodim qoʻshish" }).click();
  await expect(page.getByRole("cell", { name: "operator.1", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Keyingi qadam" }).click();

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
  // Kategoriya — maʼlumotnomadan; ishlab chiqaruvchi — mahsulot shaklidan («Yangi ishlab chiqaruvchi»)
  await page.goto("/dictionaries?tab=category");
  await page.getByRole("button", { name: "Kategoriya qoʻshish" }).click();
  await field(page, "Nomi").fill("Analgetiklar E2E");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByRole("cell", { name: "Analgetiklar E2E" })).toBeVisible();

  // Mahsulot shakli — toʻliq sahifa (prototip): majburiy maydonlar, xatolar bloki
  await page.goto("/products");
  await page.getByRole("button", { name: "Mahsulot qoʻshish" }).first().click();
  await expect(page).toHaveURL(/\/products\/new$/);
  await expect(page.getByLabel(/^Mahsulot kodi/)).toHaveValue(/^[1-9]\d{7}$/);
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("7 ta maydon toʻldirilmagan")).toBeVisible();
  await field(page, "Mahsulot nomi").fill("Paracetamol E2E 500 mg");
  await field(page, "Shartnomadagi nomi").fill("Парацетамол таблетки 500 мг №10");
  await field(page, "Klassifikator nomi").fill("Paracetamol");
  await page.getByRole("combobox", { name: "Ishlab chiqaruvchi", exact: true }).click();
  await page.getByRole("button", { name: "Yangi ishlab chiqaruvchi" }).click();
  await page.getByRole("dialog").getByLabel(/^Nomi/).fill("Nobel E2E");
  await page.getByRole("button", { name: "Qoʻshish", exact: true }).click();
  await expect(page.getByText("«Nobel E2E» maʼlumotnomaga qoʻshildi")).toBeVisible();
  await choose(page, "Kategoriya", /Analgetiklar E2E/);
  await field(page, "IKPU kodi").fill("03004001001000000");
  await field(page, "Farm ID").fill("FRM-0000001");
  await field(page, "Shtrix-kodlar").fill("123");
  await field(page, "Shtrix-kodlar").press("Enter");
  await expect(page.getByText(/Shtrix-kod 8 \(EAN-8\) yoki 13/)).toBeVisible();
  await field(page, "Shtrix-kodlar").fill("");
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Mahsulot saqlandi")).toBeVisible();
  await expect(page).toHaveURL(/\/products\/\d+$/);
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
  await page.goto("/prices?tab=prices");
  await expect(page.getByRole("cell", { name: "2.500,00" })).toBeVisible();
  // Narx turlari: bazaviy «Narx» — narxi bor mahsulot soni, tahrirlash va tarix
  await page.goto("/prices");
  await expect(page.getByRole("tab", { name: "Narx turlari", selected: true })).toBeVisible();
  await page.getByRole("cell", { name: "Promo", exact: true }).click();
  await page.getByRole("button", { name: "Tahrirlash" }).click();
  await page.getByRole("textbox", { name: "Muqobil nomi" }).fill("Промо");
  await page.getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("«Promo» saqlandi")).toBeVisible();
  await expect(page.getByRole("cell", { name: "Промо" })).toBeVisible();
});

test("CEO: Ctrl+K — mahsulot (kirillda), sahifa va NO hujjati", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);
  await page.keyboard.press("Control+K");
  const input = page.getByRole("combobox", { name: "Qidirish" });
  await expect(input).toBeFocused();
  await input.fill("парацетамол");
  await expect(page.getByRole("group", { name: "Mahsulotlar" }).getByRole("option", { name: /Paracetamol E2E/ })).toBeVisible();
  await input.press("Enter");
  await expect(page).toHaveURL(/\/products\?q=Paracetamol/);

  await page.keyboard.press("Control+K");
  await page.getByRole("combobox", { name: "Qidirish" }).fill("NO-");
  await page.getByRole("group", { name: "Narx oʻzgarishlari (NO)" }).getByRole("option").first().click();
  await expect(page).toHaveURL(/\/prices\?tab=documents&open=\d+/);
  await expect(page.getByText("NO-TSH-000001").first()).toBeVisible();

  await page.goto("/");
  const palette = page.getByRole("combobox", { name: "Qidirish" });
  await expect(async () => {
    await page.keyboard.press("Control+K");
    await expect(palette).toBeVisible({ timeout: 1000 });
  }).toPass();
  await palette.fill("kassa");
  await page.getByRole("group", { name: "Sahifalar" }).getByRole("option", { name: /Kassa/ }).first().click();
  await expect(page).toHaveURL(/\/cash/);
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

  // Qoldiqlar — mahsulot boʻyicha: jami va mavjud
  await page.goto("/stock");
  await expect(page.getByRole("row", { name: /Paracetamol E2E/ })).toContainText("120");
  await page.getByRole("row", { name: /Paracetamol E2E/ }).click();
  await expect(page.getByText("Partiya × zona")).toBeVisible();
  // Partiya boʻyicha koʻrinish
  await page.goto("/stock?view=batch");
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
  await page.getByRole("button", { name: "Yangi kirim" }).click();
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
  // Bildirishnoma sarlavhadagi tugmalar ustida — sichqoncha ustida tursa yopilmaydi
  await page.mouse.move(0, 0);
  await expect(page.getByText("Qoralama saqlandi")).toBeHidden({ timeout: 15_000 });

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

  await page.goto("/stock?view=batch");
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
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await page.getByRole("combobox", { name: "Mahsulot", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("E2E");
  await page.getByRole("option", { name: /Paracetamol E2E/ }).click();
  await field(page, "Miqdor").first().fill("10");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await expect(page.getByText("Muammo yoʻq — buyurtmani yuborish mumkin")).toBeVisible();
  await expect(page.locator(`dl[aria-label="Jami"]`).getByText("25.000,00", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();
  await expect(page.getByText("Navbatda — ombor yigʻishga tayyorlaydi")).toBeVisible();

  // Vaqt berish → yigʻish → hisobdan oʻtkazish
  await field(page, "Yigʻish vaqti").fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByRole("status").getByText("Vaqt berildi", { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/picking");
  await page.getByRole("button", { name: "Yigʻishni boshlash" }).first().click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByText("Olindi").first().click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();

  // E1 (07.11): markirovkasiz buyurtma ham Markirovkachidan «Tasdiqlash» bilan oʻtadi
  await page.goto("/settings/employees");
  await page.getByRole("button", { name: "Xodim qoʻshish" }).click();
  const dialog = page.getByRole("dialog", { name: "Yangi xodim" });
  await dialog.getByLabel(/^F\.I\.Sh\.\s*\*?$/).fill("Malika Markirovkachi");
  await dialog.getByLabel(/^Login\s*\*?$/).fill("marker.0");
  await choose(page, "Rol", /^Markirovkachi$/);
  await choose(page, "Filial", /Toshkent/);
  await dialog.getByLabel(/^Vaqtinchalik parol\s*\*?$/).fill(OPERATOR_TEMP);
  await dialog.getByRole("button", { name: "Xodimni saqlash" }).click();
  await expect(page.getByText("Xodim qoʻshildi").first()).toBeVisible();
  const marker = await page
    .context()
    .browser()!
    .newPage({ baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000" });
  await login(marker, "marker.0", OPERATOR_TEMP);
  await changePassword(marker, OPERATOR_TEMP, OPERATOR_PASSWORD);
  await expect(marker).toHaveURL(/\/$/);
  await marker.goto("/marking");
  await marker.getByRole("tab", { name: /Navbat/ }).click();
  const card = marker.getByRole("listitem").filter({ hasText: "Shifo Dorixona E2E" }).first();
  await expect(card).toContainText("Markirovkasiz — tasdiqlash");
  await card.getByRole("button", { name: "Markirovkani boshlash" }).click();
  await marker.getByRole("region", { name: "Markirovkasiz qatorlar" }).getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await expect(marker.getByText("1 / 1 qator tasdiqlandi")).toBeVisible();
  await marker.getByRole("button", { name: "Markirovkani yakunlash" }).click();
  await expect(marker.getByText("Markirovka yakunlandi").first()).toBeVisible();
  await marker.close();

  await page.goto("/orders");
  await page.getByRole("cell", { name: "Shifo Dorixona E2E" }).first().click();
  await expect(page.getByRole("heading", { name: "Hisobdan oʻtkazish" })).toBeVisible();
  await page.getByText("Tekshirildi").first().click();
  await field(page, "Joylar soni").fill("1");
  await page.getByRole("button", { name: "Hisobdan oʻtkazish" }).click();
  await expect(page.getByText("Hisobdan oʻtkazildi — hujjatlashtirishga")).toBeVisible();
  await page.keyboard.press("Escape");

  // Holat yorliqlari: buyurtma «Hujjatlashtirilmoqda» yorligʻida, «Qoralama» da yoʻq
  const tabs = page.getByRole("tablist", { name: "Buyurtma holatlari" });
  await tabs.getByRole("tab", { name: /^Hujjatlashtirilmoqda/ }).click();
  await expect(tabs.getByRole("tab", { name: /^Hujjatlashtirilmoqda/ })).toHaveAttribute("aria-selected", "true");
  // Prototip holat kartasi: nomi + soni + summasi
  await expect(tabs.getByRole("tab", { name: /^Hujjatlashtirilmoqda/ })).toContainText(/[\d.]+,\d\d/);
  await expect(page.getByRole("cell", { name: "Shifo Dorixona E2E" }).first()).toBeVisible();
  await tabs.getByRole("tab", { name: /^Qoralama/ }).click();
  await expect(page.getByRole("cell", { name: "Shifo Dorixona E2E" })).toHaveCount(0);
  await tabs.getByRole("tab", { name: /^Hammasi/ }).click();
  await expect(page.getByRole("cell", { name: "Shifo Dorixona E2E" }).first()).toBeVisible();

  // Ombor monitori: buyurtma «Hujjatlashtirilmoqda» ustunida
  await page.goto("/warehouse");
  await expect(page.getByRole("heading", { name: "Ombor mudiri paneli" })).toBeVisible();
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

test("CEO: ombor koʻchirishi (OK) — qoralama → joʻnatish → qabul (kamomad bilan)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  // Filialda ikkinchi ombor
  await page.goto("/settings/warehouses");
  await page.getByRole("button", { name: "Ombor qoʻshish" }).click();
  await field(page, "Nomi").fill("E2E ikkinchi ombor");
  await page.getByRole("button", { name: "Omborni saqlash" }).click();
  await expect(page.getByText("E2E ikkinchi ombor").first()).toBeVisible();

  await page.goto("/warehouse-transfers");
  await page.getByRole("button", { name: "Koʻchirish tuzish" }).first().click();
  await choose(page, "Qaysi ombordan", /Markaziy ombor/);
  await choose(page, "Zona", /Asosiy saqlash/);
  await choose(page, "Qaysi omborga", /E2E ikkinchi ombor/);
  await page.getByLabel(/E2E-01 — joʻnatish soni/).fill("5");
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();

  await page.getByRole("button", { name: "Joʻnatish", exact: true }).click();
  await expect(page.getByText("Joʻnatildi — tovar yoʻlda")).toBeVisible();

  await page.getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await page.getByLabel(/E2E-01 — kelgan soni/).fill("4");
  await field(page, "Izoh").fill("1 dona shikastlangan");
  // Qabul oynasi hujjat oynasi ichida (oxirgi dialog) — uning asosiy tugmasi
  await page.getByRole("dialog").last().getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await expect(page.getByText("Qabul qilindi, kamomad 1 dona")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/warehouse-transfers");
  const row = page.getByRole("row", { name: /OK-/ }).first();
  await expect(row).toContainText("Qabul qilindi");
  await expect(row).toContainText("E2E ikkinchi ombor");
});

test("CEO: hisobdan chiqarish (HC) — shikastlangan tovar darhol oʻtkaziladi, tannarx bilan", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/write-offs");
  await page.getByRole("button", { name: "Hisobdan chiqarish" }).first().click();
  const drawer = page.getByRole("dialog").last();
  await drawer.getByRole("combobox", { name: "Ombor", exact: true }).click();
  await page.getByRole("option", { name: /Markaziy ombor/ }).click();
  await drawer.getByRole("combobox", { name: "Zona", exact: true }).click();
  await page.getByRole("option", { name: /Asosiy saqlash/ }).click();
  await drawer.getByRole("combobox", { name: "Sabab", exact: true }).click();
  await page.getByRole("option", { name: "Shikastlangan" }).click();
  await drawer.getByLabel(/E2E-01 — hisobdan chiqarish soni/).fill("2");
  await drawer.getByLabel("Dalolatnoma raqami").fill("E2E-AKT-1");
  await drawer.getByRole("button", { name: "Hisobdan chiqarish", exact: true }).click();
  await expect(page.getByText("Tovar hisobdan chiqarildi")).toBeVisible();
  await expect(drawer.getByText("3.601,00", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  const row = page.getByRole("row", { name: /HC-/ }).first();
  await expect(row).toContainText("Oʻtkazildi");
  await expect(row).toContainText("Shikastlangan");
});

test("CEO: OK kamomadini hisobdan chiqarish (HC, qoldiq harakatisiz)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/warehouse-transfers");
  await page.getByRole("row", { name: /OK-/ }).first().click();
  await expect(page.getByText("Kamomad: 1 dona — hal qilinmagan")).toBeVisible();
  await page.getByRole("dialog").last().getByRole("button", { name: "Hisobdan chiqarish", exact: true }).click();
  await page.getByRole("dialog").last().getByLabel("Izoh").fill("Yoʻlda shikastlangan");
  await page.getByRole("dialog").last().getByRole("button", { name: "Hisobdan chiqarish", exact: true }).click();
  await expect(page.getByText("Hisobdan chiqarish hujjati tuzildi")).toBeVisible();
  await expect(page.getByText("Kamomad: 1 dona — hal qilindi")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/write-offs");
  const row = page.getByRole("row", { name: /Kamomad/ }).first();
  await expect(row).toContainText("Oʻtkazildi");
});

test("CEO: inventarizatsiya (IN) — qoralama → sanoqni ochish → sanash → bekor qilish (qulf yechiladi)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/inventory-counts");
  await page.getByRole("button", { name: "Inventarizatsiya boshlash" }).first().click();
  const drawer = page.getByRole("dialog").last();
  await drawer.getByRole("combobox", { name: "Ombor", exact: true }).click();
  await page.getByRole("option", { name: /Markaziy ombor/ }).click();
  await drawer.getByRole("combobox", { name: "Zona", exact: true }).click();
  await page.getByRole("option", { name: /Asosiy saqlash/ }).click();
  await drawer.getByRole("button", { name: "Qoralama yaratish" }).click();
  await expect(page.getByText("Qoralama yaratildi")).toBeVisible();
  await expect(page.getByText("Sanoq hali ochilmagan")).toBeVisible();

  await page.getByRole("dialog").last().getByRole("button", { name: "Sanoqni ochish" }).click();
  await expect(page.getByText(/Sanoq ketmoqda · 0%/)).toBeVisible();
  await page
    .getByRole("dialog")
    .last()
    .getByLabel(/— sanalgan soni/)
    .first()
    .fill("1");
  await page.getByRole("dialog").last().getByRole("button", { name: "Saqlash" }).click();
  await expect(page.getByText("Sanoq saqlandi")).toBeVisible();

  await page.getByRole("dialog").last().getByRole("button", { name: "Bekor qilish" }).click();
  const modal = page.getByRole("dialog").last();
  await modal.getByLabel("Sabab").fill("E2E sinov");
  await modal.getByRole("button", { name: "Bekor qilish" }).click();
  await expect(page.getByText("Bekor qilindi, qulf yechildi")).toBeVisible();
  await page.keyboard.press("Escape");

  const row = page.getByRole("row", { name: /IN-/ }).first();
  await expect(row).toContainText("Bekor qilingan");
});

test("CEO: YB ga qaytarish (QY) — kirim partiyasi darhol qaytariladi, qarz kamayadi", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/supplier-returns");
  await page.getByRole("button", { name: "Qaytarish" }).first().click();
  const drawer = page.getByRole("dialog").last();
  await drawer.getByRole("combobox", { name: "Yetkazib beruvchi", exact: true }).click();
  await page.getByPlaceholder("Qidirish").fill("Pharm");
  await page.getByRole("option", { name: /Pharm Supply E2E/ }).click();
  await drawer.getByRole("combobox", { name: "Kirim", exact: true }).click();
  await page.getByRole("option", { name: /KR-/ }).first().click();
  await drawer.getByRole("combobox", { name: "Sabab", exact: true }).click();
  await page.getByRole("option", { name: "Sifatsiz (brak)" }).click();
  await drawer.getByRole("combobox", { name: "Zona", exact: true }).click();
  await page
    .getByRole("option", { name: /Asosiy saqlash/ })
    .first()
    .click();
  await expect(drawer.getByText("zonasidagi kirim partiyalari")).toBeVisible();
  await drawer.getByLabel(/KR-E2E — qaytarish soni/).fill("1");
  await drawer.getByRole("button", { name: "Qaytarish", exact: true }).click();
  await expect(page.getByText("Tovar YB ga qaytarildi")).toBeVisible();
  await expect(drawer.getByText("2.000,00", { exact: false }).first()).toBeVisible();
  await page.keyboard.press("Escape");

  const row = page.getByRole("row", { name: /QY-/ }).first();
  await expect(row).toContainText("Oʻtkazildi");
  await expect(row).toContainText("Pharm Supply E2E");
});

test("CEO: filiallararo savdo (FS) — ikkinchi filial, joʻnatish (HF, tannarx) → xaridor qabul qiladi", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  // Ikkinchi filial va uning ombori
  await page.goto("/settings/branches");
  await page.getByRole("button", { name: "Filial qoʻshish" }).first().click();
  await field(page, "Kod").fill("SMQ");
  await field(page, "STIR").fill("309876543");
  await field(page, "Nomi").fill("E2E Samarqand");
  await field(page, "Yuridik nomi").fill("E2E Samarqand MChJ");
  await page.getByRole("button", { name: "Filialni saqlash" }).click();
  await expect(page.getByText("E2E Samarqand").first()).toBeVisible();

  await page.goto("/settings/warehouses");
  await page.getByRole("button", { name: "Ombor qoʻshish" }).click();
  // Roʻyxat filtrida ham «Filial» bor — ombor oynasi ichidagisi
  await page.getByRole("dialog").getByRole("combobox", { name: "Filial", exact: true }).click();
  await page.getByRole("option", { name: /E2E Samarqand/ }).click();
  await field(page, "Nomi").fill("Samarqand ombori");
  await page.getByRole("button", { name: "Omborni saqlash" }).click();
  await expect(page.getByText("Samarqand ombori").first()).toBeVisible();

  await page.goto("/branch-sales");
  await page.getByRole("button", { name: "Savdo tuzish" }).first().click();
  await choose(page, "Qaysi ombordan", /Markaziy ombor/);
  await choose(page, "Zona", /Asosiy saqlash/);
  await choose(page, "Xaridor ombori", /Samarqand ombori/);
  await page.getByLabel(/E2E-01 — joʻnatish soni/).fill("1");
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();

  await page.getByRole("button", { name: "Joʻnatish", exact: true }).click();
  await expect(page.getByText("Joʻnatildi — tovar yoʻlda")).toBeVisible();
  await expect(page.getByText(/HF-[A-Z]{3}-\d{6}/).first()).toBeVisible();

  await page.getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await page.getByRole("dialog").last().getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await expect(page.getByText("Toʻliq qabul qilindi")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/branch-sales");
  const row = page.getByRole("row", { name: /FS-/ }).first();
  await expect(row).toContainText("Qabul qilindi");
  await expect(row).toContainText("E2E Samarqand");
});

test("CEO: FS kamomadi — topildi, sotuvchiga qaytariladi (qarz kamayadi)", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/branch-sales");
  await page.getByRole("button", { name: "Savdo tuzish" }).first().click();
  await choose(page, "Qaysi ombordan", /Markaziy ombor/);
  await choose(page, "Zona", /Asosiy saqlash/);
  await choose(page, "Xaridor ombori", /Samarqand ombori/);
  await page.getByLabel(/E2E-01 — joʻnatish soni/).fill("2");
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi")).toBeVisible();
  await page.getByRole("button", { name: "Joʻnatish", exact: true }).click();
  await expect(page.getByText("Joʻnatildi — tovar yoʻlda")).toBeVisible();

  await page.getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await page.getByLabel(/E2E-01 — kelgan soni/).fill("1");
  await page.getByRole("dialog").last().getByLabel("Izoh").fill("1 quti yuklanmay qolgan");
  await page.getByRole("dialog").last().getByRole("button", { name: "Qabul qilish", exact: true }).click();
  await expect(page.getByText("Qabul qilindi, kamomad 1 dona")).toBeVisible();
  await expect(page.getByText(/Kamomad: 1 dona .*— hal qilinmagan/)).toBeVisible();

  await page.getByRole("button", { name: "Topildi — sotuvchiga qaytarish" }).click();
  await page.getByRole("dialog").last().getByLabel("Izoh").fill("Markaziy omborda topildi");
  await page.getByRole("dialog").last().getByRole("button", { name: "Qaytarish", exact: true }).click();
  await expect(page.getByText("Tovar sotuvchiga qaytarildi")).toBeVisible();
  await expect(page.getByText(/Kamomad: 1 dona .*— hal qilindi/)).toBeVisible();
  await expect(page.getByText(/Sotuvchiga qaytarildi · qarz -/)).toBeVisible();
});
