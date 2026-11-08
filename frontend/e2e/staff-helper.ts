import { expect, type Page } from "@playwright/test";

let phoneSeq = 0;

/**
 * «Xodim qoʻshish» paneli (prototip WizStaff) orqali xodim qoʻshadi; avtomatik bir martalik parol oʻrniga testlar
 * keyingi bosqichlarda ishlatadigan maʼlum vaqtinchalik parolni API orqali beradi (xuddi «Yangi parol yaratish»).
 */
export async function addStaff(
  page: Page,
  s: { name: string; login: string; role: RegExp; branch?: RegExp; password: string },
): Promise<void> {
  const [first, ...rest] = s.name.split(" ");
  await page.getByRole("button", { name: "Xodim qoʻshish" }).first().click();
  const panel = page.getByRole("dialog", { name: "Yangi xodim" });
  await panel.getByLabel(/^Familiya\s*\*?$/).fill(rest.join(" ") || "Sinov");
  await panel.getByLabel(/^Ism\s*\*?$/).fill(first ?? s.name);
  phoneSeq += 1;
  await panel.getByLabel(/^Telefon\s*\*?$/).fill(`97${String(1000000 + (Date.now() % 1000000) + phoneSeq).slice(-7)}`);
  await panel.getByRole("combobox", { name: "Rol", exact: true }).click();
  await page.getByRole("option", { name: s.role }).first().click();
  const branch = panel.getByRole("combobox", { name: "Filial", exact: true });
  if (await branch.count()) {
    await branch.click();
    await page
      .getByRole("option", { name: s.branch ?? /Toshkent/ })
      .first()
      .click();
  }
  await panel.getByLabel(/^Login\s*\*?$/).fill(s.login);
  await panel.getByRole("button", { name: "Saqlash", exact: true }).click();
  const warn = page.getByRole("dialog", { name: "Ogohlantirish" });
  const creds = page.getByRole("dialog", { name: "Kirish maʼlumotlari" });
  await expect(creds.or(warn)).toBeVisible();
  if (await warn.isVisible()) await warn.getByRole("button", { name: "Davom etish" }).click();
  await expect(creds).toBeVisible();
  await creds.getByRole("button", { name: "Tayyor" }).click();
  await expect(page.getByRole("cell", { name: s.login, exact: true })).toBeVisible();

  // Maʼlum parol (testlar shu bilan kiradi)
  const list = (await (await page.request.get("/api/employees")).json()) as { id: number; login: string }[];
  const id = list.find((e) => e.login === s.login)?.id;
  expect(id).toBeTruthy();
  const cookies = await page.context().cookies();
  const xsrf = cookies.find((c) => c.name === "XSRF-TOKEN")?.value ?? "";
  const r = await page.request.post(`/api/employees/${id}/reset-password`, {
    data: { temporaryPassword: s.password },
    headers: { "X-XSRF-TOKEN": xsrf },
  });
  expect(r.ok()).toBeTruthy();
}
