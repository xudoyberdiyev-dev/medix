import type { StepState } from "@/features/warehouse-transfers/doc-model";
import type { ZoneTransferDetail, ZoneTransferStatus } from "./api";

/**
 * ZK bosqichlari (prototip `TransferDoc`, kind = zk): Qoralama → (Rahbar tasdigʻi) → Tasdiqlangan.
 * Tasdiq talab qilinmasa — ikki bosqich; rad etilganda tasdiq bosqichi «fail».
 */
export function zkSteps(status: ZoneTransferStatus, needsApproval: boolean): { key: "draft" | "pending" | "posted"; state: StepState }[] {
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
  action: "create" | "pending" | "posted" | "rejected";
  reason?: string;
}

/** Tarix (eng yangisi yuqorida): yaratildi (tasdiq kerak boʻlsa — tasdiqqa yubordi), tasdiqladi / rad etdi. */
export function zkHistory(doc: ZoneTransferDetail): ZkEvent[] {
  const out: ZkEvent[] = [
    { at: doc.createdAt, employee: doc.createdBy, action: doc.needsApproval ? "pending" : "create", reason: doc.note || undefined },
  ];
  if (doc.postedAt && doc.needsApproval)
    out.push({ at: doc.postedAt, employee: doc.postedBy ?? undefined, action: "posted" });
  if (doc.rejectedAt)
    out.push({ at: doc.rejectedAt, employee: doc.rejectedBy ?? undefined, action: "rejected", reason: doc.rejectReason ?? undefined });
  return out.sort((a, b) => b.at.localeCompare(a.at));
}
