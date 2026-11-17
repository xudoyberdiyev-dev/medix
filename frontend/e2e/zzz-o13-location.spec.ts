import { expect, test, type Page } from "@playwright/test";

/**
 * O13 (egasi 17.11.2026): mahsulotning ombordagi joyi («Hudud»). Direktor mahsulot shaklida joy kiritadi → roʻyxatda ustun va
 * joy boʻyicha qidiruv → buyurtma yigʻilganda Yigʻuvchi panelida qator ostida «Joyi: …». Maʼlumot first-run va roles-chain dan keyin bor.
 */
test.describe.configure({ mode: "serial" });

const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const OPERATOR_PASSWORD = "Operator-parol-2026";
const PASSWORD = "Rol-parol-2026";
const CUSTOMER = "Shifo Dorixona E2E";
const PLACE = "E2E qator · 3-stellaj · 2-polka";
let number = "";

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

test("Direktor: mahsulot shaklida ombordagi joy → roʻyxat ustuni va qidiruv", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  const res = await page.request.get("/api/products?q=Paracetamol%20E2E%20500");
  expect(res.ok()).toBeTruthy();
  const id = ((await res.json()) as { items: { id: number }[] }).items[0]?.id;
  expect(id).toBeTruthy();
  await page.goto(`/products/${id}/edit`);
  // Bitta ombor — «Hudud (ombordagi joyi)», bir nechta — «Hudud — <ombor>»
  const place = page.getByLabel(/^Hudud (\(ombordagi joyi\)|— .*Markaziy ombor)$/).first();
  await expect(place).toBeVisible();
  await place.fill(PLACE);
  await page.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Mahsulot saqlandi")).toBeVisible();
  await expect(page.getByText(PLACE).first()).toBeVisible();

  await page.goto("/products?q=E2E qator");
  await expect(page.getByRole("cell", { name: "Paracetamol E2E 500 mg" })).toBeVisible();
});

test("Yigʻuvchi panelida qator joyi koʻrinadi", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Yangi buyurtma" }).click();
  await choose(page, "Mijoz", new RegExp(CUSTOMER), "Shifo");
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await choose(page, "Mahsulot", /Paracetamol E2E/, "Paracetamol");
  await field(page, "Miqdor").first().fill("1");
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
  // Markirovkasiz buyurtmada «Markirovka vaqti» maydoni yoʻq
  const markTime = field(page, "Markirovka vaqti");
  if (await markTime.count()) await markTime.fill("10");
  await page.getByRole("button", { name: "Vaqt berish" }).click();
  await expect(page.getByRole("status").getByText("Vaqt berildi", { exact: true })).toBeVisible();

  await login(page, "picker.1", PASSWORD);
  await page.goto("/picking");
  await page.locator("article").filter({ hasText: number }).getByRole("button", { name: "Yigʻishni boshlash" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await expect(page.getByText(`Joyi: ${PLACE}`)).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /^Joy boʻyicha saralash/ })).toBeVisible();
  for (const c of await page.getByRole("checkbox", { name: /^Olindi/ }).all()) await c.click();
  await page.getByRole("button", { name: "Yigʻishni yakunlash" }).click();
  await expect(page.getByText("Yigʻish yakunlandi")).toBeVisible();
});
