import { expect, test } from "@playwright/test";

/** Til tanlash (SPEC 10): cookie'ga yoziladi, URL oʻzgarmaydi, sahifa yangi tilda qayta chiziladi. */
test("login sahifasida tilni almashtirish", async ({ page, context }) => {
  await page.goto("/login");
  await expect(page.getByText("Ishni davom ettirish uchun tizimga kiring")).toBeVisible();

  // O20: yuqori oʻngda til menyusi (Oʻzbekcha / Ўзбекча / Русский)
  await page.getByRole("button", { name: "Interfeys tili" }).click();
  await page.getByRole("option", { name: "Русский" }).click();
  await expect(page.getByText("Войдите в систему, чтобы продолжить работу")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  expect((await context.cookies()).find((c) => c.name === "MEDIX_LOCALE")?.value).toBe("ru");

  await page.getByRole("button", { name: "Язык интерфейса" }).click();
  await expect(page.getByRole("option", { name: "Русский" })).toHaveAttribute("aria-selected", "true");
  await page.getByRole("option", { name: "Ўзбекча" }).click();
  await expect(page.getByText("Ишни давом эттириш учун тизимга киринг")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "uz-Cyrl");
});
