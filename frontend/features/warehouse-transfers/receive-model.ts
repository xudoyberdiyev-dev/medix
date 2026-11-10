import type { TransferLine } from "./api";

/** Farq sababi (prototip `TR_REASONS`): Kam keldi / Shikastlangan / Boshqa. */
export const RECEIVE_REASONS = ["SHORT", "DAMAGED", "OTHER"] as const;
export type ReceiveReason = (typeof RECEIVE_REASONS)[number];

export interface ReceiveRow {
  /** Qabul qilingan (sotuvga yaroqli) — kiritilgan matn. */
  recv: string;
  reason: ReceiveReason | null;
  zoneId: number | null;
}

export type RowError = { kind: "num" } | { kind: "over"; sent: number } | { kind: "reason" } | { kind: "zone" };

export interface ReceivePlan {
  errors: Record<number, RowError[]>;
  sent: number;
  received: number;
  diff: number;
  damaged: number;
  /** Serverga yuboriladigan qatorlar (`ReceiveLineRequest`). */
  lines: { lineId: number; receivedQty: number; damagedQty: number; toZoneId: number; reason?: ReceiveReason }[];
}

/**
 * Qabul rejasi (prototip `TransferReceive`): har qatorda kelgan (yaroqli) miqdor ≤ joʻnatilgan butun son; farq boʻlsa sabab majburiy;
 * zona majburiy. «Shikastlangan» farqi — jismonan keldi, Karantinga qabul qilinadi (`damagedQty`), kamomad hisoblanmaydi.
 */
export function receivePlan(lines: TransferLine[], rows: Record<number, ReceiveRow>): ReceivePlan {
  const errors: Record<number, RowError[]> = {};
  const out: ReceivePlan["lines"] = [];
  let sent = 0;
  let received = 0;
  let diff = 0;
  let damaged = 0;
  for (const l of lines) {
    const r = rows[l.id] ?? { recv: String(l.qty), reason: null, zoneId: null };
    const errs: RowError[] = [];
    sent += l.qty;
    const raw = r.recv.trim();
    const n = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (Number.isNaN(n)) errs.push({ kind: "num" });
    else if (n > l.qty) errs.push({ kind: "over", sent: l.qty });
    const d = Number.isNaN(n) || n > l.qty ? 0 : l.qty - n;
    if (d > 0 && !r.reason) errs.push({ kind: "reason" });
    if (r.zoneId === null) errs.push({ kind: "zone" });
    if (!Number.isNaN(n) && n <= l.qty) {
      received += n;
      diff += d;
      if (d > 0 && r.reason === "DAMAGED") damaged += d;
    }
    if (errs.length) errors[l.id] = errs;
    else {
      const dmg = d > 0 && r.reason === "DAMAGED" ? d : 0;
      out.push({
        lineId: l.id,
        receivedQty: n + dmg,
        damagedQty: dmg,
        toZoneId: r.zoneId as number,
        reason: d > 0 && r.reason ? r.reason : undefined,
      });
    }
  }
  return { errors, sent, received, diff, damaged, lines: out };
}
