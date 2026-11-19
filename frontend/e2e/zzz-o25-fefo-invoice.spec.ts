import { expect, test, type Page } from "@playwright/test";

/**
 * O25 (egasi 19.11.2026): yigʻilmagan buyurtmaning ombor fakturasi — «Seriya va muddat FEFO boʻyicha koʻrsatilsinmi?»
 * «Ha, FEFO bilan» — zahiradagi partiyalar, izoh; «Yoʻq, oddiy» — seriya boʻsh. Buyurtma shu yerda yaratiladi (navbatga, yigʻilmaydi);
 * mijoz va mahsulot — first-run / roles-chain / O16 dan.
 */
test.describe.configure({ mode: "serial" });

const OPERATOR_PASSWORD = "Operator-parol-2026";
const CUSTOMER = "Shifo Dorixona E2E";

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

test("Operator: yigʻilmagan buyurtma fakturasi — FEFO soʻrovi Ha/Yoʻq", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  await page.goto("/orders");
  await page.getByRole("button", { name: "Yangi buyurtma" }).click();
  await choose(page, "Mijoz", new RegExp(CUSTOMER), "Shifo");
  await choose(page, "Joʻnatiladigan ombor", /Markaziy ombor/);
  await choose(page, "Mahsulot", /Amoksitsillin E2E/, "Amoksitsillin");
  await field(page, "Miqdor").first().fill("1");
  await page.getByRole("button", { name: "Qator qoʻshish" }).click();
  await page.getByRole("button", { name: "Qoralamani saqlash" }).click();
  await expect(page.getByText("Qoralama saqlandi").first()).toBeVisible();
  await page.getByRole("button", { name: "Yuborish" }).click();
  await expect(page.getByText("Buyurtma navbatga yuborildi")).toBeVisible();
  const id = Number(/\/orders\/(\d+)/.exec(page.url())?.[1]);
  expect(id).toBeGreaterThan(0);
  const plain = (await (await page.request.get(`/api/orders/${id}/invoice-forms`)).json()) as { picked: boolean; fefo: boolean };
  expect(plain.picked).toBe(false);
  expect(plain.fefo).toBe(false);
  const api = (await (await page.request.get(`/api/orders/${id}/invoice-forms?fefo=true`)).json()) as {
    fefo: boolean;
    rows: { batchHint?: string; shortage?: number }[];
  };
  expect(api.fefo).toBe(true);
  expect(api.rows.every((r) => r.batchHint === "RESERVED" || r.shortage != null)).toBeTruthy();

  await page.goto(`/orders/${id}`);
  await page.getByRole("button", { name: "Chop etish" }).click();
  await page.getByRole("menuitem", { name: "Faktura: Фактура для склада", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("fefo-question")).toBeVisible();
  await expect(dialog.getByText("Seriya va muddat FEFO boʻyicha koʻrsatilsinmi?")).toBeVisible();
  await dialog.getByRole("button", { name: "Ha, FEFO bilan" }).click();
  await expect(dialog.getByText("Seriya va muddat — tizim taklifi (FEFO)", { exact: false })).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "FEFO bilan" })).toHaveAttribute("aria-checked", "true");

  // Almashtirish: oddiy — izoh yoʻq
  await dialog.getByRole("radio", { name: "Oddiy" }).click();
  await expect(dialog.getByText("Seriya va muddat — tizim taklifi (FEFO)", { exact: false })).toHaveCount(0);

  // Mijoz fakturasida soʻrov yoʻq
  await dialog.getByRole("tab", { name: "Фактура Для клиента №1" }).click();
  await expect(dialog.getByTestId("fefo-question")).toHaveCount(0);

  // Qayta ochilganda (eslab qolinmagan) — yana soʻraladi; «Yoʻq, oddiy»
  await dialog.getByRole("button", { name: "Ortga" }).click();
  await page.getByRole("button", { name: "Chop etish" }).click();
  await page.getByRole("menuitem", { name: "Faktura: Фактура для склада №2" }).click();
  await expect(dialog.getByTestId("fefo-question")).toBeVisible();
  await dialog.getByRole("button", { name: "Yoʻq, oddiy" }).click();
  await expect(dialog.getByTestId("fefo-question")).toHaveCount(0);
  await expect(dialog.getByRole("radio", { name: "Oddiy" })).toHaveAttribute("aria-checked", "true");
});
