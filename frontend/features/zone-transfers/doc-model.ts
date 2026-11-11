import type { StepState } from "@/features/warehouse-transfers/doc-model";
import type { ZoneTransferDetail, ZoneTransferStatus } from "./api";

/**
 * ZK bosqichlari (prototip `TransferDoc`, kind = zk): Qoralama → (Rahbar tasdigʻi) → Tasdiqlangan.
 * Tasdiq talab qilinmasa — ikki bosqich; rad etilganda tasdiq bosqichi «fail», bekor qilinganda — qoralama «fail».
 */
export function zkSteps(status: ZoneTransferStatus, needsApproval: boolean): { key: "draft" | "pending" | "posted"; state: StepState }[] {
  const keys = needsApproval ? (["draft", "pending", "posted"] as const) : (["draft", "posted"] as const);
  if (status === "DRAFT") return keys.map((key, i) => ({ key, state: i === 0 ? "cur" : "next" }));
  if (status === "CANCELLED") return keys.map((key, i) => ({ key, state: i === 0 ? "fail" : "next" }));
  if (!needsApproval)
    return [
      { key: "draft", state: "done" },
      { key: "posted", state: status === "POSTED" ? "done" : "cur" },
    ];
  return [
    { key: "draft", state: "done" },
    { key: "pending", state: status === "PENDING" ? "cur" : status === "REJECTED" ? "fail" : "done" },
    { key: "posted", state: status === "POSTED" ? "done" : "next" },
  ];
}

export interface ZkEvent {
  at: string;
  employee?: string;
  action: "create" | "pending" | "posted" | "rejected" | "cancelled";
  reason?: string;
}

/** Tarix (eng yangisi yuqorida): yaratildi (tasdiq kerak boʻlsa — tasdiqqa yubordi), tasdiqladi / rad etdi. */
export function zkHistory(doc: ZoneTransferDetail): ZkEvent[] {
  const out: ZkEvent[] = [
    { at: doc.createdAt, employee: doc.createdBy, action: doc.needsApproval ? "pending" : "create", reason: doc.note || undefined },
  ];
  if (doc.postedAt && doc.needsApproval) out.push({ at: doc.postedAt, employee: doc.postedBy ?? undefined, action: "posted" });
  if (doc.rejectedAt)
    out.push({ at: doc.rejectedAt, employee: doc.rejectedBy ?? undefined, action: "rejected", reason: doc.rejectReason ?? undefined });
  if (doc.cancelledAt) out.push({ at: doc.cancelledAt, employee: doc.cancelledBy ?? undefined, action: "cancelled" });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}

/** Qoralama yuklamasi (avtomatik saqlash uchun). */
export interface ZkDraft {
  fromZoneId: number;
  toZoneId: number;
  note: string;
  lines: { batchId: number; qty: number }[];
}

/** Qatorlar tartibidan qatʼi nazar bir xil kalit — oʻzgarmagan qoralama qayta saqlanmaydi. */
export function zkDraftKey(d: ZkDraft | null): string | null {
  if (!d) return null;
  const lines = [...d.lines].sort((a, b) => a.batchId - b.batchId).map((l) => `${l.batchId}:${l.qty}`);
  return `${d.fromZoneId}>${d.toZoneId}|${d.note.trim()}|${lines.join(",")}`;
}
