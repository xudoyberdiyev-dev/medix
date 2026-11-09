import { matchesSearch } from "@/lib/search";

export type ReconStatus = "MADE" | "SENT" | "SIGNED" | "DIFF";
export type ReconSide = "CUSTOMER" | "SUPPLIER";
export type ReconTab = "all" | ReconStatus;

export const RECON_TABS: ReconTab[] = ["all", "MADE", "SENT", "SIGNED", "DIFF"];

export interface ReconFilterRow {
  number: string;
  counterparty: string;
  side: ReconSide;
  status: ReconStatus;
}

/** Roʻyxat filtri (prototip): yorliq (holat), kontragent turi, qidiruv — raqam yoki kontragent (lotin/kirill). */
export function filterRecons<T extends ReconFilterRow>(rows: T[], f: { tab: ReconTab; sides: ReconSide[]; q: string }): T[] {
  const q = f.q.trim();
  return rows.filter(
    (r) =>
      (f.tab === "all" || r.status === f.tab) &&
      (f.sides.length === 0 || f.sides.includes(r.side)) &&
      (!q || matchesSearch(q, [r.number, r.counterparty])),
  );
}

export function tabCounts(rows: { status: ReconStatus }[]): Record<ReconTab, number> {
  const out: Record<ReconTab, number> = { all: rows.length, MADE: 0, SENT: 0, SIGNED: 0, DIFF: 0 };
  for (const r of rows) out[r.status] += 1;
  return out;
}

/** Holat oʻtishlari (server bilan bir xil): MADE → SENT; SENT|DIFF → SIGNED yoki DIFF. */
export function canStep(from: ReconStatus, to: Exclude<ReconStatus, "MADE">): boolean {
  if (to === "SENT") return from === "MADE";
  return from === "SENT" || from === "DIFF";
}

/**
 * Qoldiq kimning foydasiga (prototip `favor`): jurnalda musbat — kontragent bizga qarzdor (mijoz) yoki biz YB ga qarzdormiz.
 * `debtorIsParty` — qarzdor kontragentmi; `advance` — kontragent avans bergan (mijoz) yoki biz YB ga avans berganmiz.
 */
export function favor(
  balance: string,
  side: ReconSide,
): { zero: true } | { zero: false; debtorIsParty: boolean; advance: boolean; abs: string } {
  const n = Number(balance);
  if (Math.abs(n) < 0.005) return { zero: true };
  const abs = balance.startsWith("-") ? balance.slice(1) : balance;
  if (side === "CUSTOMER") return { zero: false, debtorIsParty: n > 0, advance: n < 0, abs };
  return { zero: false, debtorIsParty: n < 0, advance: n < 0, abs };
}

/** Kontragent koʻrsatgan qoldiq − tizim qoldigʻi (tiyinlarda hisoblanadi, float xatosiz). */
export function diffAmount(theirs: string, ours: string): string {
  const toT = (s: string) => {
    const neg = s.trim().startsWith("-");
    const [a, b = ""] = s.trim().replace("-", "").split(".");
    return (neg ? -1 : 1) * (Number(a) * 100 + Number((b + "00").slice(0, 2)));
  };
  const d = toT(theirs) - toT(ours);
  const abs = Math.abs(d);
  return `${d < 0 ? "-" : ""}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** Davr tezkor tanlovi: shu oy, oʻtgan oy, oʻtgan chorak, yil boshidan (ISO sanalar). */
export function quickPeriods(todayIso: string): Record<"month" | "lastMonth" | "lastQ" | "ytd", [string, string]> {
  const [y, m] = todayIso.split("-").map(Number) as [number, number];
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const q = Math.floor((m - 1) / 3);
  const qy = q === 0 ? y - 1 : y;
  const qs = q === 0 ? 10 : (q - 1) * 3 + 1;
  return {
    month: [iso(y, m, 1), todayIso],
    lastMonth: [iso(py, pm, 1), iso(py, pm, last(py, pm))],
    lastQ: [iso(qy, qs, 1), iso(qy, qs + 2, last(qy, qs + 2))],
    ytd: [iso(y, 1, 1), todayIso],
  };
}
