// Haqiqiy frontendni backendsiz (API mock) ochib skrinshot oladi — UI'ni prototip bilan solishtirish uchun.
// Avval: cd frontend && pnpm build && pnpm start -p 3100 &
// Ishlatish: NODE_PATH=$(npm root -g) node scripts/ui-mock-shot.cjs /orders/123 /tmp/x.png [1440x900] [MOCK_JSON]
//   MOCK_JSON — {"/api/yo'l": javob, ...} fayli (aniq yo'l yoki yo'l boshi); berilmasa — quyidagi standart javoblar.
// Muhit: BASE (standart http://localhost:3100), PERMS (vergul bilan ruxsatlar; standart — Operator), STEPS (`|` bilan:
//   `click:<matn>`, `btn:<nom>`, `key:<tugma>`, `type:<matn>`, `wait:<ms>`).
const { chromium } = require("playwright");
const fs = require("fs");

const [route = "/", out = "/tmp/ui.png", size = "1440x900", mockFile] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const BASE = process.env.BASE || "http://localhost:3100";
const perms = (process.env.PERMS || "orders.view,orders.create,orders.cancel,catalog.view,prices.view").split(",");

const defaults = {
  "/api/auth/me": {
    id: 7, login: "operator.1", fullName: "Malika Yusupova", mustChangePassword: false, allBranches: false, branchId: 1,
    role: { code: "OPERATOR", name: "Operator" }, permissions: perms,
  },
  "/api/auth/csrf": { token: "x", headerName: "X-XSRF-TOKEN", parameterName: "_csrf" },
  "/api/nav/badges": { company: "Medix Group" },
  "/api/branches": [{ id: 1, code: "TSH", name: "Toshkent filiali", active: true }],
  "/api/warehouses": [{ id: 1, branchId: 1, name: "Asosiy ombor", active: true, zones: [] }],
  "/api/notifications": { items: [], unread: 0, total: 0 },
};

(async () => {
  const mocks = { ...defaults, ...(mockFile ? JSON.parse(fs.readFileSync(mockFile, "utf8")) : {}) };
  const keys = Object.keys(mocks).sort((a, b) => b.length - a.length);
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: w, height: h }, locale: "uz-UZ", timezoneId: "Asia/Tashkent" });
  await ctx.addCookies([{ name: "MEDIX_SESSION", value: "mock", url: BASE }]);
  const p = await ctx.newPage();
  const misses = new Set();
  await p.route("**/api/**", (r) => {
    const u = new URL(r.request().url());
    if (u.pathname.includes("/stream") || u.pathname.includes("/events")) return r.fulfill({ status: 204, body: "" });
    const k = keys.find((x) => u.pathname === x) ?? keys.find((x) => u.pathname.startsWith(x));
    if (!k) misses.add(u.pathname);
    return r.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(k ? mocks[k] : []) });
  });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(BASE + route);
  await p.waitForTimeout(2500);
  for (const step of (process.env.STEPS || "").split("|").filter(Boolean)) {
    const [kind, ...rest] = step.split(":");
    const arg = rest.join(":");
    if (kind === "click") await p.getByText(arg, { exact: false }).first().click();
    else if (kind === "btn") await p.getByRole("button", { name: arg }).first().click();
    else if (kind === "key") await p.keyboard.press(arg);
    else if (kind === "type") await p.keyboard.type(arg, { delay: 20 });
    else if (kind === "wait") await p.waitForTimeout(Number(arg));
    await p.waitForTimeout(700);
  }
  await p.screenshot({ path: out, fullPage: process.env.FULL === "1" });
  if (misses.size) console.error("Mock yo'q (bo'sh [] qaytdi):", [...misses].join(", "));
  if (errs.length) console.error("Sahifa xatolari:", errs.slice(0, 3));
  console.log("Saqlandi:", out, "URL:", p.url());
  await b.close();
})();
