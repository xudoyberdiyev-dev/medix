import { describe, expect, it } from "vitest";
import { draftAgeDays, dueTone, parseReceiptFilters, receiptsExportHref, serializeReceiptFilters } from "./list-state";

describe("kirimlar roʻyxati — URL holati", () => {
  it("boʻsh URL — standart", () => {
    const f = parseReceiptFilters(new URLSearchParams(""));
    expect(f).toMatchObject({ status: null, suppliers: [], warehouses: [], sort: "CREATED", page: 1, size: 50 });
    expect(serializeReceiptFilters(f)).toBe("");
  });

  it("filtrlar aylanib qaytadi; notoʻgʻri qiymatlar tashlanadi", () => {
    const f = parseReceiptFilters(
      new URLSearchParams("status=draft&supplier=3,4,x&wh=7&from=2026-11-01&to=bugun&sort=AMOUNT&desc=1&page=2&size=20"),
    );
    expect(f).toMatchObject({
      status: "DRAFT",
      suppliers: [3, 4],
      warehouses: [7],
      from: "2026-11-01",
      to: null,
      sort: "AMOUNT",
      desc: true,
    });
    expect(serializeReceiptFilters(f)).toBe("status=draft&supplier=3%2C4&wh=7&from=2026-11-01&sort=AMOUNT&desc=1&page=2&size=20");
    expect(parseReceiptFilters(new URLSearchParams("status=yoq&sort=X&size=7")).status).toBeNull();
  });

  it("hisobotdan oʻtish: ?supplierId=", () => {
    expect(parseReceiptFilters(new URLSearchParams("supplierId=9&supplier=9")).suppliers).toEqual([9]);
  });

  it(".xlsx havolasi — filtrlar va tanlangan qatorlar bilan", () => {
    const f = parseReceiptFilters(new URLSearchParams("status=posted&supplier=9,10"));
    expect(receiptsExportHref(parseReceiptFilters(new URLSearchParams("")), null)).toBe("/api/receipts/export");
    expect(receiptsExportHref(f, 2, [5])).toBe("/api/receipts/export?branchId=2&status=POSTED&supplierId=9&supplierId=10&id=5");
  });

  it("qoralama yoshi va toʻlov kuni rangi", () => {
    expect(draftAgeDays("2026-11-04", "2026-11-08")).toBe(4);
    expect(draftAgeDays("2026-11-09", "2026-11-08")).toBe(0);
    expect(dueTone("POSTED", "2026-11-07", "2026-11-08")).toBe("danger");
    expect(dueTone("POSTED", "2026-11-10", "2026-11-08")).toBe("warning");
    expect(dueTone("POSTED", "2026-11-20", "2026-11-08")).toBe("default");
    expect(dueTone("DRAFT", "2026-11-01", "2026-11-08")).toBe("default");
    expect(dueTone("CANCELLED", "2026-11-01", "2026-11-08")).toBe("muted");
    expect(dueTone("POSTED", null, "2026-11-08")).toBe("muted");
  });
});
