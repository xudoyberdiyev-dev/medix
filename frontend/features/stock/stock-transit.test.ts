import { describe, expect, it } from "vitest";
import { transitHref, transitRoute } from "./stock-transit";

describe("Yoʻldagi tovar", () => {
  it("hujjat havolasi turi boʻyicha", () => {
    expect(transitHref({ kind: "OK", docId: 7 })).toBe("/warehouse-transfers?open=7");
    expect(transitHref({ kind: "FS", docId: 3 })).toBe("/branch-sales?open=3");
  });
  it("yoʻnalish: bir filial ichida — faqat omborlar, filiallar oʻrtasida — kod bilan", () => {
    expect(transitRoute({ fromBranch: "TSH", fromWarehouse: "Asosiy", toBranch: "TSH", toWarehouse: "Chilonzor" })).toBe(
      "Asosiy → Chilonzor",
    );
    expect(transitRoute({ fromBranch: "SMQ", fromWarehouse: "Asosiy", toBranch: "TSH", toWarehouse: "Asosiy" })).toBe(
      "Asosiy · SMQ → Asosiy · TSH",
    );
  });
});
