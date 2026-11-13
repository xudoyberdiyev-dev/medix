import { describe, expect, it } from "vitest";
import { accountantExportHref } from "./accountant-report";
import { markingReportExportHref, markingReportQuery } from "./marking-codes-report";
import { visibleReports } from "./catalog";

describe("O10f/g hisobotlari", () => {
  it("«Markirovka kodlari»: boʻsh filtrlar yuborilmaydi, Excel havolasi filtrlar bilan", () => {
    const f = { branchId: null, from: "2026-11-01", to: "2026-11-14", owner: null, status: null, q: "  " };
    expect(markingReportQuery(f)).toEqual({
      branchId: undefined,
      from: "2026-11-01",
      to: "2026-11-14",
      owner: undefined,
      status: undefined,
      q: undefined,
    });
    expect(markingReportExportHref({ ...f, branchId: 2, owner: "RESERVE", status: "SOLD", q: "Para" })).toBe(
      "/api/reports/marking-codes/export?branchId=2&from=2026-11-01&to=2026-11-14&owner=RESERVE&status=SOLD&q=Para",
    );
  });

  it("«Buxgalter natijasi» Excel havolasi", () => {
    expect(accountantExportHref({ branchId: null, from: "2026-11-01", to: "2026-11-14" })).toBe(
      "/api/reports/accountants/export?from=2026-11-01&to=2026-11-14",
    );
  });

  it("katalog: fakturalar ruxsati bilan ikkala hisobot, zaxira kodlar bilan — faqat kodlar", () => {
    expect(visibleReports(["invoices.view"]).map((r) => r.key)).toEqual(expect.arrayContaining(["accountants", "marking-codes"]));
    const z = visibleReports(["zcodes.view"]).map((r) => r.key);
    expect(z).toContain("marking-codes");
    expect(z).not.toContain("accountants");
  });
});
