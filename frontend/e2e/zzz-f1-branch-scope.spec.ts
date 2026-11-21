import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * F1 (egasi 21.11.2026): «Barcha filiallar» huquqli Direktor tepada filial tanlasa — boshqa filialning ombori,
 * xodimi, mashinasi hech bir roʻyxat va tanlovda koʻrinmaydi. Maʼlumot first-run dan: «Toshkent» (Markaziy ombor)
 * va «E2E Samarqand» (Samarqand ombori).
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";

function field(page: Page | Locator, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

test("F1: tanlangan filialda boshqa filial omborlari va xodimlari koʻrinmaydi", async ({ page }) => {
  await page.goto("/login");
  await field(page, "Login").fill(CEO_LOGIN);
  await field(page, "Parol").fill(CEO_PASSWORD);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);

  const branches = (await (await page.request.get("/api/branches")).json()) as { id: number; name: string }[];
  const samarkand = branches.find((b) => b.name === "E2E Samarqand");
  expect(samarkand, "first-run «E2E Samarqand» filialini yaratadi").toBeTruthy();
  const sid = samarkand!.id;

  // API: branchId bilan — faqat shu filial
  for (const path of ["/api/warehouses", "/api/warehouses/overview", "/api/employees", "/api/vehicles"]) {
    const rows = (await (await page.request.get(`${path}?branchId=${sid}`)).json()) as { branchId: number | null }[];
    expect(
      rows.every((r) => r.branchId === sid),
      path,
    ).toBe(true);
  }

  // UI: tepadagi tanlagichda «E2E Samarqand»
  await page.evaluate((id) => localStorage.setItem("yuzplus-branch", JSON.stringify({ state: { branchId: id }, version: 0 })), sid);
  await page.goto("/settings/warehouses");
  const tree = page.getByRole("navigation", { name: "Filiallar va omborlar" });
  await expect(tree.getByRole("button", { name: /Samarqand ombori/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /Markaziy ombor/ })).toHaveCount(0);

  // «Barcha filiallar» — ikkalasi ham
  await page.evaluate(() => localStorage.setItem("yuzplus-branch", JSON.stringify({ state: { branchId: null }, version: 0 })));
  await page.goto("/settings/warehouses");
  await expect(tree.getByRole("button", { name: /Samarqand ombori/ })).toBeVisible();
  await expect(tree.getByRole("button", { name: /Markaziy ombor/ })).toBeVisible();
});
