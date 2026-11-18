import { expect, test } from "@playwright/test";

/** O24 — qorongʻi rejim: topbar tugmasi, qayta yuklanganda saqlanadi, Profil → Mavzu (Yorugʻ / Qorongʻi / Tizim boʻyicha). */
test("mavzu almashadi va saqlanadi (O24)", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel(/^Login\s*\*?$/).fill("keeper.1");
  await page.getByLabel(/^Parol\s*\*?$/).fill("Rol-parol-2026");
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  const html = page.locator("html");

  await page.getByRole("banner").getByRole("button", { name: "Qorongʻi rejimga oʻtish" }).click();
  await expect(html).toHaveClass(/theme-dark/);
  await page.reload();
  await expect(html).toHaveClass(/theme-dark/);
  await expect(html).toHaveAttribute("data-theme", "dark");

  await page.goto("/profile");
  const group = page.getByRole("radiogroup", { name: "Mavzu" });
  await expect(group.getByRole("radio", { name: "Qorongʻi" })).toHaveAttribute("aria-checked", "true");
  await group.getByRole("radio", { name: "Tizim boʻyicha" }).click();
  await expect(html).not.toHaveClass(/theme-dark/); // Playwright standarti — yorugʻ tizim
  await group.getByRole("radio", { name: "Yorugʻ" }).click();
  await expect(html).toHaveAttribute("data-theme", "light");
});
