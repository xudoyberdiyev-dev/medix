import { expect, test, type Page } from "@playwright/test";

/**
 * O18 (egasi 17.11.2026): 5 xil faktura — buyurtma kartochkasida «Chop etish» → «Faktura: …» → oldindan koʻrish oynasi:
 * katakni tuzatish (sariq, «1 ta katak tuzatildi»), Excel yuklab olish, «Asl holatiga». Tuzatish buyurtmani oʻzgartirmaydi.
 * Maʼlumot oldingi spec'lardan (yigʻilgan buyurtma bor).
 */
test.describe.configure({ mode: "serial" });

const OPERATOR_PASSWORD = "Operator-parol-2026";

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

test("Operator: faktura oynasi — tuzatish, Excel, asl holatiga", async ({ page }) => {
  await login(page, "operator.1", OPERATOR_PASSWORD);
  const res = await page.request.get("/api/orders?statuses=CHECKING,DOCUMENTING,LOADING,IN_TRANSIT,DELIVERED&size=50");
  expect(res.ok()).toBeTruthy();
  const items = ((await res.json()) as { items: { id: number; number: string }[] }).items;
  test.skip(items.length === 0, "yigʻilgan buyurtma yoʻq");
  const id = items[0].id;
  const forms = await page.request.get(`/api/orders/${id}/invoice-forms`);
  expect(forms.ok()).toBeTruthy();
  const rows = ((await forms.json()) as { rows: { name: string }[] }).rows;
  test.skip(rows.length === 0, "faktura qatorlari yoʻq");

  await page.goto(`/orders/${id}`);
  await page.getByRole("button", { name: "Chop etish" }).click();
  await page.getByRole("menuitem", { name: "Faktura: Фактура Для клиента №1" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Tuzatishlar faqat faylga yoziladi")).toBeVisible();
  // 5 tur chiplari (Operator narxni koʻradi)
  await expect(dialog.getByRole("tablist", { name: "Faktura turi" }).getByRole("tab")).toHaveCount(5);

  const name = dialog.getByLabel("Махсулот номи — 1");
  await name.fill("E2E tuzatilgan nom");
  await expect(dialog.getByText("1 ta katak tuzatildi")).toBeVisible();
  await expect(dialog.getByText(/saqlandi:/)).toBeVisible({ timeout: 10_000 });

  // Tur almashtirilsa ham tuzatish saqlanadi
  await dialog.getByRole("tab", { name: "Фактура для склада №2" }).click();
  await expect(dialog.getByLabel("Махсулот номи — 1")).toHaveValue("E2E tuzatilgan nom");

  const popup = page.context().waitForEvent("page");
  await dialog.getByRole("button", { name: "Excel yuklab olish" }).click();
  await popup;
  const xlsx = await page.request.get(`/api/orders/${id}/invoice-forms/WAREHOUSE2/xlsx`);
  expect(xlsx.ok()).toBeTruthy();
  expect(xlsx.headers()["content-disposition"]).toMatch(/faktura-warehouse2-.*\.xlsx/);

  // Buyurtma qatori oʻzgarmagan
  const order = await page.request.get(`/api/orders/${id}`);
  expect(JSON.stringify(await order.json())).not.toContain("E2E tuzatilgan nom");

  await dialog.getByRole("button", { name: "Asl holatiga" }).click();
  await expect(dialog.getByLabel("Махсулот номи — 1")).toHaveValue(rows[0].name);
  await expect(dialog.getByText("1 ta katak tuzatildi")).toHaveCount(0);
});
