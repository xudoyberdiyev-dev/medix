import { describe, expect, it } from "vitest";
import { actionHits, groupHits, KIND_LABELS, localHits, recentHits, type PaletteHit } from "./command-palette";

describe("Ctrl+K: sahifalar va hisobotlar", () => {
  it("2 belgidan qisqa yoki ruxsatlar yoʻq — boʻsh", () => {
    expect(localHits("b", ["orders.create"])).toEqual([]);
    expect(localHits("buyurtma", undefined)).toEqual([]);
  });

  it("menyu sahifasi ruxsat boʻyicha va kirillda ham topiladi", () => {
    const withPerm = localHits("буюртма", ["orders.create"]);
    expect(withPerm.some((h) => h.kind === "PAGE" && h.link === "/orders")).toBe(true);
    expect(localHits("buyurtma", ["picking.do"]).some((h) => h.link === "/orders")).toBe(false);
  });

  it("hisobot — faqat ruxsati bilan", () => {
    expect(localHits("savdo", ["reports.all"]).some((h) => h.kind === "REPORT")).toBe(true);
    expect(localHits("savdo", ["orders.create"]).some((h) => h.kind === "REPORT")).toBe(false);
  });

  it("guruhlar belgilangan tartibda, boʻshlari tashlanadi", () => {
    const hits: PaletteHit[] = [
      { key: "p1", kind: "PRODUCT", title: "Paracetamol", link: "/products?q=Paracetamol" },
      { key: "o1", kind: "ORDER", title: "BY-TSH-000001", link: "/orders?open=1" },
      { key: "page", kind: "PAGE", title: "Buyurtmalar", link: "/orders" },
    ];
    const groups = groupHits(hits);
    expect(groups.map((g) => g.kind)).toEqual(["PAGE", "ORDER", "PRODUCT"]);
    expect(groups[1]?.label).toBe(KIND_LABELS.ORDER);
  });
});

describe("Ctrl+K: tez amallar va oxirgilar (U6)", () => {
  const label = (k: string) => ({ order: "Yangi buyurtma", payment: "Mijozdan toʻlov" })[k] ?? k;
  it("amallar ruxsatga qarab; boʻsh soʻrovda hammasi, qidiruvda mosi", () => {
    expect(actionHits("", ["orders.create"], label).map((h) => h.link)).toEqual(["/orders/new"]);
    expect(actionHits("", ["picking.do"], label)).toEqual([]);
    expect(actionHits("toʻlov", ["orders.create", "payments.create"], label).map((h) => h.link)).toEqual(["/payments/mt/new"]);
  });
  it("oxirgi yoʻl menyu boʻlimi nomi bilan; ruxsatsiz boʻlim tashlanadi", () => {
    const hits = recentHits(["/orders/351", "/cash"], ["orders.create"], (i) => i.label);
    expect(hits).toHaveLength(1);
    expect(hits[0]).toMatchObject({ kind: "RECENT", title: "Buyurtmalar · 351", link: "/orders/351" });
  });
});
