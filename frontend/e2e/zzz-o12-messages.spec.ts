import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * O12 (egasi 17.11.2026): Direktor → Yigʻuvchiga topshiriq + rasm → Yigʻuvchi panelida (telefon oʻlchamida) koʻradi →
 * «Bajarildi» → Direktorga bildirishnoma va «Men bergan» da holat. Maʼlumot roles-chain dan keyin bor (picker.1).
 */
const CEO_LOGIN = process.env.E2E_CEO_LOGIN ?? "ceo";
const CEO_PASSWORD = "Yangi-CEO-parol-2026";
const PICKER_PASSWORD = "Rol-parol-2026";
const TITLE = "Zona B ni tartiblash E2E";
// 1×1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

function field(page: Page | Locator, label: string) {
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

test("O12: Direktor → Yigʻuvchiga topshiriq + rasm → Bajarildi → Direktorga xabar", async ({ page }) => {
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await page.getByRole("link", { name: "Xabarlar" }).first().click();
  await expect(page).toHaveURL(/\/messages/);
  await page.getByRole("button", { name: "Yangi xabar" }).first().click();
  const dlg = page.getByRole("dialog", { name: "Yangi xabar" });
  await dlg.getByRole("combobox", { name: "Qabul qiluvchilar", exact: true }).click();
  await page
    .getByRole("option", { name: /Yusuf Yigʻuvchiyev/ })
    .first()
    .click();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeVisible();
  await dlg.getByRole("button", { name: "Topshiriq sifatida" }).click();
  await field(dlg, "Topshiriq sarlavhasi").fill(TITLE);
  await field(dlg, "Muddat").fill("2030-12-31T17:00");
  await dlg.getByTestId("message-file").setInputFiles({ name: "zona-b.png", mimeType: "image/png", buffer: PNG });
  await expect(dlg.getByText("zona-b.png")).toBeVisible();
  await dlg.getByLabel("Tavsif (ixtiyoriy)").fill("Qutilarni yorliq boʻyicha joylang");
  await dlg.getByRole("button", { name: "Yuborish" }).click();

  await expect(dlg).toBeHidden();
  const card = page.getByTestId("task-card").filter({ hasText: TITLE });
  await expect(card).toBeVisible();
  await expect(card.getByText("Yangi").first()).toBeVisible();
  await expect(page.getByRole("button", { name: /zona-b\.png/ })).toBeVisible();

  // Yigʻuvchi — telefon oʻlchamida
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "picker.1", PICKER_PASSWORD);
  await expect(page.getByRole("link", { name: /Xabarlar/ }).first()).toBeVisible();
  await page.goto("/messages?view=tasks");
  const item = page.getByRole("button", { name: new RegExp(TITLE) });
  await expect(item).toBeVisible();
  await item.click();
  const mine = page.getByTestId("task-card").filter({ hasText: TITLE });
  await expect(mine).toBeVisible();
  await expect(page.getByRole("button", { name: /zona-b\.png/ })).toBeVisible();
  await mine.getByRole("button", { name: "Bajarildi" }).click();
  await expect(mine.getByRole("button", { name: "Bajarildi" })).toBeHidden();
  await expect(mine.getByText("Bajarildi").first()).toBeVisible();

  // Direktor: bildirishnoma va «Men bergan»
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, CEO_LOGIN, CEO_PASSWORD);
  await page.getByRole("button", { name: /^Bildirishnomalar/ }).click();
  await expect(page.getByText(`Topshiriq bajarildi: ${TITLE}`)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/messages?view=tasks");
  await page.getByRole("button", { name: "Men bergan" }).click();
  const given = page.getByRole("button", { name: new RegExp(TITLE) });
  await expect(given.getByText("Bajarildi")).toBeVisible();
});
