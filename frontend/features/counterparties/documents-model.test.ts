import { describe, expect, it } from "vitest";
import { docHref, docSections, docState, sectionHref, sectionPermission, type DocRow } from "./documents-model";

const row = (p: Partial<DocRow>): DocRow => ({
  id: 7,
  number: "SV-TSH-000001",
  date: "2026-11-01",
  branchCode: "TSH",
  branchName: "Toshkent",
  status: "POSTED",
  amount: "1250000.00",
  ...p,
});

describe("documents-model", () => {
  it("yorliqlar tartibi prototip boʻyicha", () => {
    expect(docSections(true)).toEqual(["ORDERS", "SALES", "PAYMENTS", "RETURNS"]);
    expect(docSections(false)).toEqual(["RECEIPTS", "PAYMENTS", "RETURNS"]);
  });

  it("ruxsatlar API bilan bir xil", () => {
    expect(sectionPermission("RETURNS", true)).toBe("qm.view");
    expect(sectionPermission("RETURNS", false)).toBe("qy.view");
    expect(sectionPermission("SALES", true)).toBe("shipments.view");
  });

  it("sotuv holati: toʻlangan, muddati, kechikkan", () => {
    expect(docState(row({ open: "0.00", dueDate: "2026-11-05" }), "2026-11-09").kind).toBe("paid");
    expect(docState(row({ open: "100.00", dueDate: "2026-11-20" }), "2026-11-09")).toEqual({
      kind: "due",
      due: "2026-11-20",
      open: "100.00",
      tone: "warning",
    });
    expect(docState(row({ open: "100.00", dueDate: "2026-11-05" }), "2026-11-09")).toEqual({
      kind: "late",
      days: 4,
      open: "100.00",
      tone: "danger",
    });
  });

  it("qolgan hujjatlar — bazadagi holat", () => {
    expect(docState(row({ status: "DRAFT" }), "2026-11-09")).toEqual({ kind: "status", status: "DRAFT", tone: "warning" });
    expect(docState(row({ status: "CANCELLED", open: "5.00" }), "2026-11-09").tone).toBe("neutral");
  });

  it("havolalar", () => {
    expect(docHref("SALES", true, row({ linkId: 42 }))).toBe("/orders/42");
    expect(docHref("SALES", true, row({ linkId: undefined }))).toBeNull();
    expect(docHref("RECEIPTS", false, row({ linkId: 9 }))).toBe("/receipts/9");
    expect(docHref("PAYMENTS", true, row({ linkId: 7 }))).toBe("/payments?open=7");
    expect(sectionHref("PAYMENTS", false)).toBe("/payments?tab=yt");
  });
});
