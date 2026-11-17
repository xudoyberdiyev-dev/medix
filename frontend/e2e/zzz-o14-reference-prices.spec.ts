import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * O14 (egasi 17.11.2026): referent narxlar fayli yuklanadi → ustunlar avtomatik moslanadi → solishtirish →
 * natija yorliqlari (soni bilan) → «Topilmadi» → Excel yuklab olinadi → tarixda koʻrinadi.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

test("O14: referent narx fayli → solishtirish → yorliqlar → Excel → tarix", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/reference-prices");
  await expect(page.getByRole("main").getByRole("heading", { name: "Referent narxlar", exact: true })).toBeVisible();
  await page.getByTestId("ref-file").setInputFiles({
    name: "davlat-narxlari.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Davlat referent narxlari\nNomi;Ishlab chiqaruvchi;Narx\nE2E nomaʼlum dori A;Zavod;12 500,00\nE2E nomaʼlum dori B;Zavod;7000\n",
    ),
  });
  await expect(page.getByRole("heading", { name: "Ustunlarni moslash" })).toBeVisible();
  await expect(page.getByText("davlat-narxlari.csv · 2 ta qator")).toBeVisible();
  await page.getByRole("button", { name: "Solishtirish", exact: true }).click();

  await expect(page).toHaveURL(/reference-prices\?id=\d+/);
  await expect(page.getByRole("heading", { name: "davlat-narxlari.csv" })).toBeVisible();
  const notFound = page.getByRole("tab", { name: /Topilmadi/ });
  await expect(notFound).toContainText("2");
  await notFound.click();
  await expect(page.getByRole("cell", { name: /E2E nomaʼlum dori A/ })).toBeVisible();
  await expect(page.getByRole("cell", { name: "12.500,00" })).toBeVisible();

  const href = await page.getByRole("link", { name: "Hammasini Excelʼga" }).getAttribute("href");
  const xlsx = await page.request.get(href ?? "");
  expect(xlsx.status()).toBe(200);
  expect(xlsx.headers()["content-type"]).toContain("spreadsheetml");

  await page.getByRole("button", { name: "Tarixga qaytish" }).click();
  await expect(page.getByRole("cell", { name: "davlat-narxlari.csv" }).first()).toBeVisible();
});
