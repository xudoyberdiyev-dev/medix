import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * O11 (egasi 13.11.2026): hisob-faktura rasmiy shakli uchun maʼlumot — oʻlchov birligining soliq kodi (Maʼlumotnomalar → Birliklar)
 * va Mahsulotlarda «MXIK yoʻq» filtri (URL'da saqlanadi). HF PDF/Excel mazmuni backend IT da (OrderIT) tekshiriladi.
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

test("O11: birlik soliq kodi va «MXIK yoʻq» filtri", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/dictionaries?tab=unit");
  await page.getByRole("button", { name: "Birlik qoʻshish" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Yangi: birlik" });
  await field(dlg, "Nomi").fill("Ampula E2E");
  // Faqat raqam qabul qilinadi (harflar tashlanadi)
  await field(dlg, "Soliq kodi").fill("79a6");
  await expect(field(dlg, "Soliq kodi")).toHaveValue("796");
  await dlg.getByRole("button", { name: "Saqlash", exact: true }).click();
  await expect(page.getByText("Qoʻshildi").first()).toBeVisible();
  const row = page.getByRole("row", { name: /Ampula E2E/ });
  await expect(row.getByRole("cell", { name: "796", exact: true })).toBeVisible();

  await page.goto("/products");
  await page.getByTestId("filter-no-ikpu").click();
  await expect(page).toHaveURL(/noIkpu=1/);
  await expect(page.getByTestId("filter-no-ikpu")).toHaveAttribute("aria-pressed", "true");
});
