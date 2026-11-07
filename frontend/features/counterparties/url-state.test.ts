import { describe, expect, it } from "vitest";
import { counterpartyExportQuery, parseCounterpartyQuery, serializeCounterpartyQuery, sortColumn } from "./url-state";

describe("kontragentlar URL holati", () => {
  it("standart — nom boʻyicha, URL toza", () => {
    const f = parseCounterpartyQuery(new URLSearchParams(""), "CUSTOMER");
    expect(f).toMatchObject({ sort: "NAME", desc: false, status: "ACTIVE", page: 1, size: 50 });
    expect(serializeCounterpartyQuery(f)).toBe("");
  });

  it("saralash va filtrlar URL orqali qaytadi", () => {
    const qs = "q=shifo&status=ALL&region=7&sort=LICENSE&desc=1&page=2&size=100";
    const f = parseCounterpartyQuery(new URLSearchParams(qs), "CUSTOMER");
    expect(f).toMatchObject({ q: "shifo", status: "ALL", regionId: 7, sort: "LICENSE", desc: true, page: 2, size: 100 });
    expect(serializeCounterpartyQuery(f)).toBe(qs);
  });

  it("notoʻgʻri saralash — nom", () => {
    expect(parseCounterpartyQuery(new URLSearchParams("sort=PHONE"), "SUPPLIER").sort).toBe("NAME");
  });

  it("eksport — filtr va saralash bilan, sahifasiz", () => {
    const f = parseCounterpartyQuery(new URLSearchParams("q=a&sort=TIN&desc=1&page=3"), "SUPPLIER");
    expect(counterpartyExportQuery(f)).toBe("q=a&role=SUPPLIER&status=ACTIVE&sort=TIN&desc=true");
  });

  it("ustun ↔ saralash maydoni", () => {
    expect(sortColumn("REGION")).toBe("region");
    expect(sortColumn("NAME")).toBe("name");
  });
});
