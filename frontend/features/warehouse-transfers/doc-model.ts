import type { WarehouseTransferDetail, WarehouseTransferStatus } from "./api";

export type StepState = "done" | "cur" | "next" | "fail";

/** OK bosqichlari (prototip `TransferDoc`): Qoralama → Joʻnatildi · yoʻlda → Qabul qilindi; bekor qilinganda — qoralama «fail». */
export function okSteps(status: WarehouseTransferStatus): { key: "draft" | "transit" | "received"; state: StepState }[] {
  const keys = ["draft", "transit", "received"] as const;
  if (status === "CANCELLED") return keys.map((key, i) => ({ key, state: i === 0 ? "fail" : "next" }));
  const ci = status === "DRAFT" ? 0 : status === "IN_TRANSIT" ? 1 : 2;
  return keys.map((key, i) => ({ key, state: i < ci || (status === "RECEIVED" && i === ci) ? "done" : i === ci ? "cur" : "next" }));
}

export interface OkEvent {
  at: string;
  employee?: string;
  action: "create" | "transit" | "received" | "diff" | "cancelled";
  reason?: string;
}

/** Tarix: hujjat maydonlaridan (yaratildi, joʻnatildi, qabul qilindi / farq bilan, bekor qilindi) — eng yangisi yuqorida. */
export function okHistory(doc: WarehouseTransferDetail): OkEvent[] {
  const out: OkEvent[] = [{ at: doc.createdAt, employee: doc.createdBy, action: "create", reason: doc.note || undefined }];
  if (doc.sentAt) out.push({ at: doc.sentAt, employee: doc.sentBy ?? undefined, action: "transit" });
  if (doc.receivedAt)
    out.push({
      at: doc.receivedAt,
      employee: doc.receivedBy ?? undefined,
      action: doc.shortageQty > 0 ? "diff" : "received",
      reason: doc.receiveNote || undefined,
    });
  if (doc.cancelledAt) out.push({ at: doc.cancelledAt, employee: doc.cancelledBy ?? undefined, action: "cancelled" });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Qoralama yuklamasi (avtomatik saqlash uchun): qatorlar tartibidan qatʼi nazar bir xil kalit — oʻzgarmagan boʻlsa saqlanmaydi. */
export interface OkDraft {
  fromZoneId: number;
  toWarehouseId: number;
  note: string;
  lines: { batchId: number; qty: number }[];
}

export function draftKey(d: OkDraft | null): string | null {
  if (!d) return null;
  const lines = [...d.lines].sort((a, b) => a.batchId - b.batchId).map((l) => `${l.batchId}:${l.qty}`);
  return `${d.fromZoneId}>${d.toWarehouseId}|${d.note.trim()}|${lines.join(",")}`;
}

/** Saqlangan hujjatdan qoralama (tahrirlashni boshlash). */
export function draftOf(doc: WarehouseTransferDetail): OkDraft {
  return {
    fromZoneId: doc.fromZone.id,
    toWarehouseId: doc.toWarehouse.id,
    note: doc.note ?? "",
    lines: doc.lines.map((l) => ({ batchId: l.batchId, qty: l.qty })),
  };
}

/** FEFO: eng yaqin muddatli partiya birinchi, keyin mahsulot nomi va partiya. */
export function fefo<T extends { expiryDate: string; productName: string; batchNumber: string }>(rows: readonly T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      a.expiryDate.localeCompare(b.expiryDate) || a.productName.localeCompare(b.productName) || a.batchNumber.localeCompare(b.batchNumber),
  );
}
