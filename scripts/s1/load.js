// S1 yuklama sinovi (k6). Sintetik baza (scripts/s1/run.sh + load-fixup.sql) ustida ishlaydi — PRODUCTION'DA EMAS.
// Bosqichlar: 50 → 150 → 300 bir vaqtdagi foydalanuvchi. Har virtual foydalanuvchi bir marta kiradi (sessiya cookie),
// so'ng roli bo'yicha ish aralashmasini bajaradi (Operator — buyurtma kiritish va topshirish; zahirada FOR UPDATE toʻqnashuvi
// uchun «issiq» 60 ta mahsulot). Natija: so'rov turi bo'yicha p95, xatolar ulushi (handleSummary → JSON + matn).
import http from "k6/http";
import { check, group, sleep } from "k6";
import exec from "k6/execution";
import { Counter, Trend } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://localhost:8080";
const PASSWORD = __ENV.S1_PASSWORD || "S1-yuklama-2026";
const USERS = 150;
const STAGE = Number(__ENV.STAGE_SECONDS || 120);
const HOT = 60;

export const options = {
  scenarios: {
    mix: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "20s", target: 50 },
        { duration: `${STAGE}s`, target: 50 },
        { duration: "20s", target: 150 },
        { duration: `${STAGE}s`, target: 150 },
        { duration: "20s", target: 300 },
        { duration: `${STAGE}s`, target: 300 },
        { duration: "10s", target: 0 },
      ],
      gracefulRampDown: "30s",
    },
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  thresholds: {
    // xabar uchun (sinovni yiqitmaydi): umumiy p95 < 1,5 s, xatolar < 1 %
    "http_req_duration{expected_response:true}": [{ threshold: "p(95)<1500", abortOnFail: false }],
    http_req_failed: [{ threshold: "rate<0.01", abortOnFail: false }],
  },
};

const ordersCreated = new Counter("s1_orders_created");
const ordersSubmitted = new Counter("s1_orders_submitted");
const conflicts = new Counter("s1_conflicts_409");
const stageLatency = {};
for (const s of ["50", "150", "300"]) stageLatency[s] = new Trend(`s1_vus_${s}`, true);
const NAMES = [
  "home.operator", "orders.list.mine", "orders.customerCredit", "orders.catalog.q", "orders.catalog", "orders.create",
  "orders.get", "orders.submit", "search", "home.accountant", "debts.customers", "orders.list.branch", "reports.sales.month",
  "orders.monitor", "orders.pickQueue", "stock.list", "stock.list.q", "home.branch", "home.director", "orders.list.all",
  "debts.customers.all", "audit.7d",
];
const byName = {};
for (const n of NAMES) byName[n] = new Trend(`s1_${n.split(".").join("_")}`, true);

function xsrf() {
  const c = http.cookieJar().cookiesForURL(BASE)["XSRF-TOKEN"];
  return c && c.length ? c[0] : "";
}

function headers(extra) {
  return Object.assign({ "Content-Type": "application/json", "X-XSRF-TOKEN": xsrf(), "Accept-Language": "uz-Latn" }, extra || {});
}

let me = null;

function req(name, method, path, body) {
  const params = { headers: headers(), tags: { name } };
  const url = `${BASE}${path}`;
  const r = method === "GET" ? http.get(url, params) : http.request(method, url, body ? JSON.stringify(body) : null, params);
  if (r.status === 409) conflicts.add(1, { name });
  // VU raqami 50/150/300 bosqichda qoʻshiladi: __VU ≤ 50 — birinchi bosqichdan, ammo keyingi bosqichlarda ham ishlaydi;
  // shuning uchun bosqich — hozirgi faol VU soni boʻyicha (exec.instance.vusActive)
  const active = exec.instance.vusActive;
  const vus = active <= 60 ? "50" : active <= 170 ? "150" : "300";
  stageLatency[vus].add(r.timings.duration);
  if (byName[name]) byName[name].add(r.timings.duration);
  return r;
}

function login() {
  const userId = ((__VU - 1) % USERS) + 1;
  http.get(`${BASE}/api/auth/csrf`, { tags: { name: "auth.csrf" } });
  const r = http.post(`${BASE}/api/auth/login`, JSON.stringify({ login: `s1user${userId}`, password: PASSWORD }), {
    headers: headers(),
    tags: { name: "auth.login" },
  });
  check(r, { "kirish 200": (x) => x.status === 200 });
  if (r.status !== 200) {
    console.error(`login s1user${userId}: ${r.status} ${String(r.body).slice(0, 200)}`);
    return null;
  }
  const m = http.get(`${BASE}/api/auth/me`, { headers: headers(), tags: { name: "auth.me" } });
  const j = m.json();
  return { userId, role: j.role, branchId: j.branchId || ((userId - 1) % 4) + 1 };
}

function rnd(n) {
  return Math.floor(Math.random() * n) + 1;
}

function today(offset) {
  const d = new Date(Date.now() + (offset || 0) * 86400000);
  return d.toISOString().slice(0, 10);
}

function operator() {
  const wh = (me.branchId - 1) * 2 + 1 + (Math.random() < 0.5 ? 0 : 1);
  group("operator", () => {
    req("home.operator", "GET", `/api/home/operator`);
    req("orders.list.mine", "GET", `/api/orders?mine=true&page=0&size=50`);
    const customerId = rnd(5000);
    req("orders.customerCredit", "GET", `/api/orders/customer-credit?warehouseId=${wh}&customerId=${customerId}`);
    req("orders.catalog.q", "GET", `/api/orders/catalog?warehouseId=${wh}&customerId=${customerId}&q=dori%20${rnd(999)}&page=0&size=50`);
    req("orders.catalog", "GET", `/api/orders/catalog?warehouseId=${wh}&customerId=${customerId}&inStockOnly=true&page=0&size=50`);
    sleep(1);
    const lines = [];
    const used = new Set();
    for (let i = 0; i < 5; i++) {
      let p = Math.random() < 0.6 ? rnd(HOT) : rnd(15000);
      while (used.has(p)) p = rnd(15000);
      used.add(p);
      lines.push({ productId: p, qty: rnd(3) });
    }
    const c = req("orders.create", "POST", `/api/orders`, {
      customerId,
      warehouseId: wh,
      deliveryType: "DELIVERY",
      paymentType: "CASH",
      deliveryDate: today(1),
      lines,
    });
    if (!check(c, { "buyurtma yaratildi": (x) => x.status === 200 || x.status === 201 })) {
      if (Math.random() < 0.05) console.warn(`orders.create ${c.status} ${String(c.body).slice(0, 300)}`);
      return;
    }
    ordersCreated.add(1);
    const id = c.json().id;
    req("orders.get", "GET", `/api/orders/${id}`);
    sleep(1);
    const s = req("orders.submit", "POST", `/api/orders/${id}/submit`);
    if (check(s, { "buyurtma topshirildi": (x) => x.status === 200 || x.status === 204 })) {
      ordersSubmitted.add(1);
    } else if (Math.random() < 0.05) {
      console.warn(`orders.submit ${s.status} ${String(s.body).slice(0, 300)}`);
    }
    req("search", "GET", `/api/search?q=BY-TSH-${String(rnd(99999)).padStart(5, "0")}`);
  });
}

function accountant() {
  group("accountant", () => {
    req("home.accountant", "GET", `/api/home/accountant?branchId=${me.branchId}`);
    req("debts.customers", "GET", `/api/debts/customers?branchId=${me.branchId}`);
    req("orders.list.branch", "GET", `/api/orders?branchId=${me.branchId}&page=0&size=50`);
    req("reports.sales.month", "GET", `/api/reports/sales?branchId=${me.branchId}&from=${today(-30)}&to=${today(0)}&groupBy=CUSTOMER`);
  });
}

function warehouse() {
  group("warehouse", () => {
    req("orders.monitor", "GET", `/api/orders/monitor?branchId=${me.branchId}`);
    req("orders.pickQueue", "GET", `/api/orders/pick-queue`);
    req("stock.list", "GET", `/api/stock?branchId=${me.branchId}&page=0&size=50`);
    req("stock.list.q", "GET", `/api/stock?branchId=${me.branchId}&q=dori%20${rnd(999)}&page=0&size=50`);
  });
}

function manager() {
  group("manager", () => {
    const branch = me.branchId;
    req("home.branch", "GET", `/api/home/branch?branchId=${branch}`);
    req("orders.list.branch", "GET", `/api/orders?branchId=${branch}&page=0&size=50`);
    req("orders.monitor", "GET", `/api/orders/monitor?branchId=${branch}`);
  });
}

function director() {
  group("director", () => {
    req("home.director", "GET", `/api/home/director`);
    req("orders.list.all", "GET", `/api/orders?page=0&size=50`);
    req("debts.customers.all", "GET", `/api/debts/customers`);
    req("reports.sales.month", "GET", `/api/reports/sales?from=${today(-30)}&to=${today(0)}&groupBy=BRANCH`);
    req("audit.7d", "GET", `/api/audit?from=${today(-7)}&to=${today(0)}&page=0&size=50`);
  });
}

export default function () {
  if (me === null) {
    me = login() || false;
    if (me) {
      // k6 har iteratsiyada cookie'larni tozalaydi — sessiya (SESSION, XSRF-TOKEN) saqlab qoʻyiladi
      const jar = http.cookieJar().cookiesForURL(BASE);
      me.cookies = {};
      for (const k of Object.keys(jar)) me.cookies[k] = jar[k][0];
    }
    sleep(Math.random() * 2);
  } else if (me) {
    const jar = http.cookieJar();
    for (const k of Object.keys(me.cookies)) jar.set(BASE, k, me.cookies[k]);
  }
  if (!me) {
    sleep(5);
    return;
  }
  const u = me.userId;
  if (u <= 3) director();
  else if (u % 10 === 1) accountant();
  else if (u % 10 === 2) warehouse();
  else if (u % 10 === 3) manager();
  else operator();
  // foydalanuvchi oʻylash vaqti: 3–8 s
  sleep(3 + Math.random() * 5);
}

export function handleSummary(data) {
  const rows = [];
  for (const [k, v] of Object.entries(data.metrics)) {
    if (!k.startsWith("s1_") || v.type !== "trend") continue;
    const s = v.values;
    rows.push(`${k.padEnd(32)} n=${String(s.count).padStart(6)} med=${s.med.toFixed(0)} p95=${s["p(95)"].toFixed(0)} p99=${s["p(99)"].toFixed(0)} max=${s.max.toFixed(0)}`);
  }
  rows.sort();
  const m = data.metrics;
  const head = [
    `S1 yuklama: so'rovlar=${m.http_reqs.values.count} rps=${m.http_reqs.values.rate.toFixed(1)}`,
    `xatolar=${(m.http_req_failed.values.rate * 100).toFixed(2)}% 409=${m.s1_conflicts_409 ? m.s1_conflicts_409.values.count : 0}`,
    `buyurtma yaratildi=${m.s1_orders_created ? m.s1_orders_created.values.count : 0} topshirildi=${m.s1_orders_submitted ? m.s1_orders_submitted.values.count : 0}`,
    `p95 umumiy=${m.http_req_duration.values["p(95)"].toFixed(0)} ms`,
  ];
  const text = ["S1-LOAD-BEGIN", ...head, ...rows, "S1-LOAD-END"].join("\n") + "\n";
  return { stdout: text, "s1-load-summary.json": JSON.stringify(data) };
}
