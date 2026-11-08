import { expect, test } from "@playwright/test";

/** Til tanlash (SPEC 10): cookie'ga yoziladi, URL oʻzgarmaydi, sahifa yangi tilda qayta chiziladi. */
test("login sahifasida tilni almashtirish", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Tizimga kirish" })).toBeVisible();

  // Prototip LoginScreen: yuqori oʻngda Oʻz / Ўз / Ру
  await page.getByRole("radiogroup", { name: "Interfeys tili" }).getByRole("radio", { name: "Русский" }).click();
  await expect(page.getByRole("heading", { name: "Вход в систему" })).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((c) => c.name === "MEDIX_LOCALE")?.value).toBe("ru");

  await expect(page.getByRole("radio", { name: "Русский" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radiogroup", { name: "Язык интерфейса" }).getByRole("radio", { name: "Ўзбекча" }).click();
  await expect(page.getByRole("heading", { name: "Тизимга кириш" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz-Cyrl");
});
