import { describe, expect, it } from "vitest";
import { auditCsv, auditDiff, objectHref, type AuditRow } from "./audit-model";

const row = (over: Partial<AuditRow> = {}): AuditRow => ({
  id: 1,
  occurredAt: "2026-11-10T00:00:00Z",
  action: "sales_order.cancel",
  category: "CANCEL",
  controlled: false,
  entityType: "sales_order",
  entityId: "5",
  ...over,
});

describe("audit model", () => {
  it("obyekt havolasi faqat maʼlum tur va raqamli id uchun", () => {
    expect(objectHref(row())).toBe("/orders/5");
    expect(objectHref(row({ entityType: "company", entityId: "1" }))).toBeNull();
    expect(objectHref(row({ entityId: null }))).toBeNull();
  });

  it("oldin → keyin: faqat oʻzgargan maydonlar", () => {
    expect(auditDiff(row({ oldValue: '{"status":"NEW","total":"10"}', newValue: '{"status":"CANCELLED","total":"10"}' }))).toEqual([
      { field: "status", before: "NEW", after: "CANCELLED" },
    ]);
    expect(auditDiff(row({ newValue: '{"active":true}' }))).toEqual([{ field: "active", before: "—", after: "✓" }]);
    expect(auditDiff(row({ oldValue: "buzuq" }))).toEqual([{ field: "value", before: "buzuq", after: "—" }]);
  });

  it("CSV: sarlavha, qoʻshtirnoq ekranlanadi, filialsiz — «Barcha filiallar»", () => {
    const csv = auditCsv([row({ employeeName: 'Ali "A"', reason: "Mijoz rad etdi", objectLabel: "BY-TSH-000005" })], {
      head: ["Vaqt", "Xodim"],
      time: () => "10.11.2026 05:00",
      cat: () => "Bekor qildi",
      object: (r) => r.objectLabel ?? "",
      allBranches: "Barcha filiallar",
    });
    expect(csv.split("\n")).toEqual([
      '"Vaqt";"Xodim"',
      '"10.11.2026 05:00";"Ali ""A""";"";"Barcha filiallar";"Bekor qildi";"BY-TSH-000005";"Mijoz rad etdi";""',
    ]);
  });
});
