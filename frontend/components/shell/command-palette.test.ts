import { describe, expect, it } from "vitest";
import { groupHits, KIND_LABELS, localHits, type PaletteHit } from "./command-palette";

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
