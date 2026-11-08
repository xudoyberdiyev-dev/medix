import { expect, test, type Page } from "@playwright/test";

/**
 * Rollar boʻyicha yakuniy oʻtish (egasi ustuvorligi 06.11 — №2): har rol oʻz menyusidagi barcha sahifalarni ochadi.
 * Menyuda koʻrinadigan sahifa API'dan 403 yoki 5xx olmasligi, «Maʼlumot yuklanmadi» / «Ruxsat yoʻq» koʻrsatmasligi va
 * brauzerda JS xatosi boʻlmasligi kerak. Foydalanuvchilar `first-run` va `roles-chain` da yaratilgan.
 */
test.describe.configure({ mode: "serial" });

const PASSWORD = "Rol-parol-2026";
const USERS = [
  { login: process.env.E2E_CEO_LOGIN ?? "ceo", password: "Yangi-CEO-parol-2026" },
  { login: "director.1", password: PASSWORD },
  { login: "manager.1", password: PASSWORD },
  { login: "operator.1", password: "Operator-parol-2026" },
  { login: "buyer.1", password: PASSWORD },
  { login: "accountant.1", password: PASSWORD },
  { login: "cashier.1", password: PASSWORD },
  { login: "keeper.1", password: PASSWORD },
  { login: "picker.1", password: PASSWORD },
  { login: "marker.1", password: PASSWORD },
  { login: "driver.1", password: PASSWORD },
] as const;

function field(page: Page, label: string) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return page.getByLabel(new RegExp(`^${escaped}\\s*\\*?$`));
}

for (const user of USERS) {
  test(`${user.login}: menyudagi barcha sahifalar xatosiz ochiladi`, async ({ page }) => {
    test.setTimeout(180_000);
    const problems: string[] = [];
    let current = "/";
    page.on("response", (res) => {
      const url = new URL(res.url());
      if (!url.pathname.startsWith("/api/") || url.pathname.endsWith("/stream")) return;
      if (res.status() === 403 || res.status() >= 500) {
        problems.push(`${current}: ${res.request().method()} ${url.pathname}${url.search} → ${res.status()}`);
      }
    });
    page.on("pageerror", (e) => problems.push(`${current}: JS xato — ${e.message.slice(0, 200)}`));

    await page.goto("/login");
    await field(page, "Login").fill(user.login);
    await field(page, "Parol").fill(user.password);
    await page.getByRole("button", { name: "Tizimga kirish" }).click();
    await expect(page).toHaveURL(/\/$/);

    const nav = page.getByRole("navigation", { name: "Asosiy menyu" });
    await expect(nav.getByRole("link").first()).toBeVisible();
    // Yigʻilgan guruhlardagi havolalar ham (prototip: guruhlar yigʻiladi)
    const hrefs = [...new Set(await nav.locator("a[href]").evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? "")))];
    expect(hrefs.length).toBeGreaterThan(0);

    for (const href of [...hrefs, "/profile"]) {
      current = href;
      await page.goto(href);
      const h1 = await page
        .getByRole("heading", { level: 1 })
        .first()
        .waitFor({ timeout: 10_000 })
        .then(() => true)
        .catch(() => false);
      if (!h1) problems.push(`${href}: sahifa sarlavhasi (h1) chiqmadi`);
      await page.waitForTimeout(1_000);
      for (const text of ["Maʼlumot yuklanmadi", "Ruxsat yoʻq"]) {
        if (await page.getByText(text, { exact: true }).first().isVisible()) problems.push(`${href}: «${text}» koʻrinmoqda`);
      }
    }
    expect(problems, problems.join("\n")).toEqual([]);
  });
}
