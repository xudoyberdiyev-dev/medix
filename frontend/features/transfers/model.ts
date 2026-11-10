import type { components } from "@/lib/api/schema";

export type TransferItem = components["schemas"]["TransferItem"];
export type TransferOverview = components["schemas"]["TransferOverview"];
export type TransferKind = TransferItem["kind"];
export type TransferState = TransferItem["state"];

/** Prototip `Transfers` koʻrinishlari: Hammasi / Chiquvchi / Kiruvchi / Yoʻlda / Zona ichida / Filiallararo. */
export const TRANSFER_VIEWS = ["all", "out", "in", "transit", "zk", "fs"] as const;
export type TransferView = (typeof TRANSFER_VIEWS)[number];

export const TRANSFER_KINDS = ["ZK", "OK", "FS"] as const satisfies readonly TransferKind[];
export const TRANSFER_STATES = [
  "DRAFT",
  "PENDING",
  "POSTED",
  "TRANSIT",
  "RECEIVED",
  "DIFF",
  "REJECTED",
  "CANCELLED",
] as const satisfies readonly TransferState[];

/** Koʻrinish shartlari (prototip VS): chiquvchi — FS IN boʻlmagan hammasi; kiruvchi — ZK emas va FS OUT emas. */
export function inView(x: TransferItem, view: TransferView): boolean {
  switch (view) {
    case "all":
      return true;
    case "out":
      return x.direction !== "IN";
    case "in":
      return x.kind !== "ZK" && x.direction !== "OUT";
    case "transit":
      return x.state === "TRANSIT";
    case "zk":
      return x.kind === "ZK";
    case "fs":
      return x.kind === "FS";
  }
}

export interface TransferFilters {
  view: TransferView;
  q: string;
  kinds: TransferKind[];
  states: TransferState[];
  /** Tashkent kuni `YYYY-MM-DD`. */
  from: string | null;
  to: string | null;
}

export const EMPTY_FILTERS: TransferFilters = { view: "all", q: "", kinds: [], states: [], from: null, to: null };

/** Tashkent boʻyicha kun (`YYYY-MM-DD`). */
export function tashkentDayOf(iso: string): string {
  return new Date(new Date(iso).getTime() + 5 * 3600_000).toISOString().slice(0, 10);
}

const C2L: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "yo",
  ж: "j",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "s",
  ч: "ch",
  ш: "sh",
  щ: "sh",
  ъ: "'",
  ы: "i",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
  ў: "o'",
  қ: "q",
  ғ: "g'",
  ҳ: "h",
};

/** Qidiruv uchun: kichik harf, kirill → lotin, apostrof turlari bitta. */
export function toLatin(s: string): string {
  return [...s.toLowerCase().replace(/[ʻʼ‘’`]/g, "'")].map((ch) => C2L[ch] ?? ch).join("");
}

export function placeText(p: TransferItem["from"]): string {
  return [p.branch?.code, p.warehouse, p.zone].filter(Boolean).join(" ");
}

export function matches(x: TransferItem, f: TransferFilters): boolean {
  if (!inView(x, f.view)) return false;
  if (f.kinds.length && !f.kinds.includes(x.kind)) return false;
  if (f.states.length && !f.states.includes(x.state)) return false;
  if (f.from) {
    const d = tashkentDayOf(x.createdAt);
    if (d < f.from || d > (f.to ?? f.from)) return false;
  }
  const q = toLatin(f.q.trim());
  if (q) {
    const hay = toLatin(`${x.number} ${x.invoiceNumber ?? ""} ${placeText(x.from)} ${placeText(x.to)} ${x.createdBy}`);
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Pul satrlari yigʻindisi tiyinlarda (float ishlatilmaydi): ["1.50", "2"] → "3.50". */
export function sumMoney(values: string[]): string {
  const cents = values.reduce((a, v) => {
    const neg = v.startsWith("-");
    const [i, f = ""] = (neg ? v.slice(1) : v).split(".");
    const c = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
    return a + (neg ? -c : c);
  }, 0n);
  const neg = cents < 0n;
  const abs = neg ? -cents : cents;
  return `${neg ? "-" : ""}${abs / 100n}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export interface TransferKpis {
  transit: number;
  transitQty: number;
  /** Yoʻldagi FS summasi (special.cost bilan, `"1250.50"`); null — summa koʻrinmaydi. */
  transitSum: string | null;
  incoming: number;
  drafts: number;
  pending: number;
  diffs: number;
}

/** 4 KPI (prototip): Yoʻlda, Menga kelayotgan (yoʻlda va kiruvchi), Qoralamalar (+ tasdiqda), Farq bilan qabul qilingan. */
export function kpisOf(items: TransferItem[]): TransferKpis {
  const transit = items.filter((x) => x.state === "TRANSIT");
  const sums = transit.map((x) => x.total).filter((t): t is string => t != null);
  return {
    transit: transit.length,
    transitQty: transit.reduce((a, x) => a + x.qty, 0),
    transitSum: sums.length ? sumMoney(sums) : null,
    incoming: transit.filter((x) => inView(x, "in")).length,
    drafts: items.filter((x) => x.state === "DRAFT" || x.state === "PENDING").length,
    pending: items.filter((x) => x.state === "PENDING").length,
    diffs: items.filter((x) => x.state === "DIFF").length,
  };
}

/** Hujjat sahifasi: OK, ZK — toʻliq sahifa (`/warehouse-transfers/{id}`, `/zone-transfers/{id}`); FS — tur sahifasi `?open=`. */
export function docHref(x: Pick<TransferItem, "kind" | "id">): string {
  return x.kind === "FS" ? `${KIND_PAGE.FS}?open=${x.id}` : `${KIND_PAGE[x.kind]}/${x.id}`;
}

export const KIND_PAGE: Record<TransferKind, string> = {
  ZK: "/zone-transfers",
  OK: "/warehouse-transfers",
  FS: "/branch-sales",
};

/** Har tur yaratish ruxsati. */
export const KIND_CREATE: Record<TransferKind, string> = { ZK: "transfer.zk", OK: "transfer.ok", FS: "transfer.fs" };
