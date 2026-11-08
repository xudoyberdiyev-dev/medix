import type { OrderDetail } from "./api";

/** OrderCard «Terish» yorligʻi (prototip `OrderCard`: pRows) — sof hisob-kitoblar. */

type Status = OrderDetail["status"];

const AFTER_MARKING: Status[] = ["CHECKING", "DOCUMENTING", "LOADING", "IN_TRANSIT", "DELIVERED", "UNDELIVERED"];
const BEFORE_PICK: Status[] = ["DRAFT", "PENDING_APPROVAL", "QUEUED", "REJECTED", "CANCELLED"];

export interface PickRow {
  key: string;
  product: string;
  batch: string;
  expiryDate: string;
  zone: string;
  qty: number;
  /** Markirovka: done — skanerlangan; wait — kutilmoqda; none — markirovkasiz. */
  mark: "done" | "wait" | "none";
}

export function pickRows(doc: Pick<OrderDetail, "lines" | "status">): PickRow[] {
  const markDone = AFTER_MARKING.includes(doc.status);
  return doc.lines.flatMap((l) =>
    l.reserved.map((r, i) => ({
      key: `${l.id}-${i}`,
      product: l.productName,
      batch: r.batch,
      expiryDate: r.expiryDate,
      zone: r.zone,
      qty: r.qty,
      mark: l.marked ? (markDone ? "done" : "wait") : "none",
    })),
  );
}

/** Terish holati: hali yoʻq (navbatgacha) / zahira (navbatda) / yigʻilmoqda / yigʻildi. */
export function pickPhase(
  doc: Pick<OrderDetail, "status" | "pickStartedAt" | "pickFinishedAt">,
): "notYet" | "reserved" | "running" | "done" {
  if (doc.pickFinishedAt) return "done";
  if (doc.pickStartedAt) return "running";
  if (doc.status === "QUEUED") return "reserved";
  return BEFORE_PICK.includes(doc.status) ? "notYet" : "done";
}
