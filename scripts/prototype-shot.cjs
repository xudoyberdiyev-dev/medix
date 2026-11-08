// Prototip ekranini (design/prototype/*.dc.html) tashqi tarmoqsiz ochib skrinshot oladi.
// Ishlatish: NODE_PATH=$(npm root -g) node scripts/prototype-shot.cjs "Home" /tmp/proto-home.png [1440x900] [kutish_ms]
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const http = require("http");
const root = path.join(__dirname, "..", "design", "prototype");
const vendor = {
  "react.production.min.js": "react.production.min.js",
  "react-dom.production.min.js": "react-dom.production.min.js",
  "babel.min.js": "babel.min.js",
  "lucide.min.js": "lucide.min.js",
};
(async () => {
  const [screen = "Medix ERP", out = "/tmp/proto.png", size = "1440x900", wait = "4000"] = process.argv.slice(2);
  const [w, h] = size.split("x").map(Number);
  const server = http.createServer((req, res) => {
    const f = path.join(root, decodeURIComponent(req.url.split("?")[0]));
    if (!f.startsWith(root) || !fs.existsSync(f)) { res.statusCode = 404; return res.end(); }
    const ext = path.extname(f);
    res.setHeader("Content-Type", ext === ".html" ? "text/html" : ext === ".js" ? "text/javascript" : ext === ".json" ? "application/json" : "application/octet-stream");
    fs.createReadStream(f).pipe(res);
  }).listen(0);
  const port = server.address().port;
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.route(/^https:\/\/(unpkg\.com|fonts\.(googleapis|gstatic)\.com)\//, (route) => {
    const name = route.request().url().split("/").pop();
    const v = vendor[name];
    if (v) return route.fulfill({ path: path.join(root, "vendor", v), contentType: "text/javascript" });
    return route.fulfill({ status: 200, body: "", contentType: "text/css" });
  });
  const errs = [];
  p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(`http://localhost:${port}/${encodeURIComponent(screen)}.dc.html`);
  await p.waitForTimeout(Number(wait));
  // STEPS (`|` bilan): click:<matn>, btn:<nom>, key:<tugma>, type:<matn>, wait:<ms>, fill:<placeholder>=<qiymat>
  for (const step of (process.env.STEPS || "").split("|").filter(Boolean)) {
    const [kind, ...rest] = step.split(":");
    const arg = rest.join(":");
    if (kind === "click") await p.getByText(arg, { exact: false }).first().click();
    else if (kind === "btn") await p.getByRole("button", { name: arg }).first().click();
    else if (kind === "key") await p.keyboard.press(arg);
    else if (kind === "type") await p.keyboard.type(arg, { delay: 20 });
    else if (kind === "wait") await p.waitForTimeout(Number(arg));
    else if (kind === "fill") {
      const [ph, value] = arg.split("=");
      await p.getByPlaceholder(ph).first().fill(value);
    }
    await p.waitForTimeout(500);
  }
  await p.screenshot({ path: out, fullPage: true });
  if (errs.length) console.error("Sahifa xatolari:", errs.slice(0, 3));
  console.log("Saqlandi:", out);
  await b.close(); server.close();
})();
