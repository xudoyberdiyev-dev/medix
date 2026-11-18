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

  // Qatorlarni YB faylidan yuklash: fayl → ustunlar avtomatik → mahsulot nom boʻyicha topiladi → qoʻshish
  await page.getByRole("button", { name: "Excelʼdan yuklash" }).click();
  const imp = page.getByRole("dialog", { name: "Qatorlarni yetkazib beruvchi faylidan yuklash" });
  await imp.getByTestId("kk-import-file").setInputFiles({
    name: "yb.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Mahsulot nomi;Soni;Narxi\nParacetamol E2E;5;1 000,00\nNomaʼlum dori XYZ;3;10\n", "utf-8"),
  });
  await imp.getByRole("button", { name: "Mahsulotlarni topish" }).click();
  await expect(imp.getByText("Qoʻshiladi: 1 ta qator. Oʻtkazib yuboriladi: 1 ta", { exact: false })).toBeVisible();
  await expect(imp.getByText("Topilmadi")).toBeVisible();
  await imp.getByRole("button", { name: "1 ta qatorni qoʻshish" }).click();
  await expect(page.getByText("1 ta qator qoʻshildi — tekshirib saqlang")).toBeVisible();
  await expect(page.getByRole("cell", { name: /Paracetamol E2E/ })).toBeVisible();
  // Bu sinovda qator qoʻlda kiritiladi — yuklanganini olib tashlaymiz
  await page.getByRole("button", { name: "Qatorni olib tashlash" }).click();

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
  const kkUrl = page.url();
  const kkId = kkUrl.split("/").pop();

  // Kirim: 8 dan 7 tasi keldi (kam) → oʻtkazish — qarz qayta yozilmaydi
  await page.getByRole("link", { name: /^KR-/ }).click();
  await expect(page).toHaveURL(/\/receipts\/\d+/);
  await page.getByRole("button", { name: "Qabul qilish" }).click();
  const accept = page.getByRole("dialog", { name: "Tovarni qabul qilish" });
  await accept.getByLabel(/^Yaroqli\s*\*?$/).fill("7");
  await accept.getByRole("button", { name: "Qabulni tasdiqlash" }).click();
  await expect(page.getByText("Tovar Qabul zonasida — sotuvga yopiq")).toBeVisible();
  await page.getByRole("button", { name: "Oʻtkazish" }).click();
  const postDialog = page.getByRole("dialog", { name: "Kirimni oʻtkazish" });
  await postDialog.getByText("Haqiqiy soni boʻyicha").click();
  await postDialog.getByRole("button", { name: "Oʻtkazish" }).click();
  await expect(page.getByText("Kirim oʻtkazildi")).toBeVisible();
  await page.keyboard.press("Escape");

  // KK: farq dalolatnomasi (PDF) va yakuniy qabul — kelmagan 3 dona qarzdan chiqadi: 10.000 → 7.000
  await page.goto(kkUrl);
  await expect(page.getByRole("button", { name: "Farq dalolatnomasi" })).toBeVisible();
  const pdf = await page.request.get(`/api/expected-receipts/${kkId}/act/pdf`);
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()["content-type"]).toContain("application/pdf");
  await page.getByRole("button", { name: "Yakuniy qabul", exact: true }).click();
  const closeDlg = page.getByRole("dialog", { name: "Yakuniy qabul" });
  await closeDlg.getByLabel(/^Sabab\s*\*?$/).fill("Qolgani kelmaydi");
  await closeDlg.getByRole("button", { name: "Yakuniy qabul" }).click();
  await expect(page.getByText("Yakunlandi").first()).toBeVisible();
  await expect(page.getByText("7.000,00").first()).toBeVisible();
});
