import { describe, expect, it } from "vitest";
import { addReport, parseReports, presetFromParam, removeReport, reportHref, MAX_REPORTS } from "./saved-reports";

describe("saved-reports", () => {
  it("davr nisbiy saqlanadi, ixtiyoriy — oy; boʻsh qiymat tashlanadi", () => {
    expect(reportHref("/reports/sales", "week", { groupBy: "CUSTOMER", x: null })).toBe("/reports/sales?period=week&groupBy=CUSTOMER");
    expect(reportHref("/reports/pickers", "custom")).toBe("/reports/pickers?period=month");
  });

  it("URL davri: notoʻgʻri yoki custom — standart", () => {
    expect(presetFromParam("month")).toBe("month");
    expect(presetFromParam("custom")).toBe("today");
    expect(presetFromParam(null, "week")).toBe("week");
  });

  it("bir xil nom yangilanadi va boshga chiqadi; cheklovlar", () => {
    const a = addReport([], " Toshkent  savdo ", "/reports/sales?period=month");
    expect(a).toEqual({ ok: true, reports: [{ name: "Toshkent savdo", href: "/reports/sales?period=month" }] });
    if (!a.ok) return;
    const b = addReport(
      [{ name: "Boshqa", href: "/reports/returns?period=today" }, ...a.reports],
      "toshkent savdo",
      "/reports/sales?period=week",
    );
    expect(b.ok && b.reports.map((r) => r.href)).toEqual(["/reports/sales?period=week", "/reports/returns?period=today"]);
    expect(addReport([], "  ", "/reports/sales")).toEqual({ ok: false, error: "empty" });
    expect(addReport([], "x".repeat(61), "/reports/sales")).toEqual({ ok: false, error: "tooLong" });
    const full = Array.from({ length: MAX_REPORTS }, (_, i) => ({ name: `r${i}`, href: "/reports/sales" }));
    expect(addReport(full, "yangi", "/reports/sales")).toEqual({ ok: false, error: "limit" });
    expect(removeReport(full, "r0")).toHaveLength(MAX_REPORTS - 1);
  });

  it("xotiradan oʻqishda tashqi va buzilgan yozuvlar tashlanadi", () => {
    const raw = JSON.stringify([
      { name: "ok", href: "/reports/sales?period=month" },
      { name: "tashqi", href: "https://evil.example/" },
      { name: "protokol", href: "//evil.example/reports/" },
      { name: 1, href: "/reports/sales" },
    ]);
    expect(parseReports(raw).map((r) => r.name)).toEqual(["ok"]);
    expect(parseReports("{buzuq")).toEqual([]);
    expect(parseReports(null)).toEqual([]);
  });
});
