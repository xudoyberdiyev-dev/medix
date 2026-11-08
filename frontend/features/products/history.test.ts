import { describe, expect, it } from "vitest";
import { historyChanges, historyKind } from "./history";

describe("mahsulot tarixi", () => {
  it("amal turi", () => {
    expect(historyKind("product.create")).toBe("create");
    expect(historyKind("product.deactivate")).toBe("status");
    expect(historyKind("product.codeChange")).toBe("change");
  });
  it("faqat oʻzgargan maydonlar", () => {
    expect(historyChanges('{"name":"A","barcodes":["1"],"minQty":null}', '{"name":"B","barcodes":["1"],"minQty":5}')).toEqual([
      { field: "name", from: "A", to: "B" },
      { field: "minQty", from: null, to: 5 },
    ]);
    expect(historyChanges(null, "buzuq")).toEqual([]);
  });
});
