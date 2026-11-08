import { parseMoneyInput, parseUzDate } from "@/features/counterparties/api";

/** Kirim qatorlar jadvali (prototip `DocumentLinesGrid` + `Receipts`) — sof hisob-kitoblar. */

export type GridMode = "edit" | "accept" | "read";

export type GridKey = "product" | "batch" | "exp" | "zone" | "qty" | "fact" | "diff" | "bonusQty" | "price" | "sum";

const PRICE_KEYS: GridKey[] = ["price", "sum"];

/** Ustunlar tartibi — prototip `KEYS` (mfg, vat, vatSum standart holatda yashirin). */
export function gridKeys(mode: GridMode, hasFact: boolean, pricesVisible: boolean): GridKey[] {
  const keys: GridKey[] =
    mode === "edit"
      ? ["product", "batch", "exp", "zone", "qty", "bonusQty", "price", "sum"]
      : hasFact
        ? ["product", "batch", "exp", "zone", "qty", "fact", "diff", "bonusQty", "price", "sum"]
        : ["product", "batch", "exp", "zone", "qty", "bonusQty", "price", "sum"];
  return pricesVisible ? keys : keys.filter((k) => !PRICE_KEYS.includes(k));
}

/** Tahrirlanadigan ustunlar (Enter/Tab shu tartibda yuradi). */
export const EDIT_KEYS: GridKey[] = ["batch", "exp", "zone", "qty", "bonusQty", "price"];

/** Pul satri × miqdor → «123.45» (tiyingacha aniq, BigInt). Narx yoki miqdor xato — null. */
export function lineSum(price: string, qty: string): string | null {
  const p = parseMoneyInput(price);
  if (!p || !/^\d+$/.test(qty.trim())) return null;
  const [w, f = ""] = p.split(".");
  const cents = (BigInt(w) * 100n + BigInt((f + "00").slice(0, 2))) * BigInt(qty.trim());
  return `${(cents / 100n).toString()}.${(cents % 100n).toString().padStart(2, "0")}`;
}

/** Yaroqlilik belgisi: muddati oʻtgan / N kun qoldi (ogohlantirish chegarasi ichida) / yoʻq. */
export function expiryFlag(expiry: string, today: string, warnDays: number): { kind: "expired" } | { kind: "soon"; days: number } | null {
  const iso = parseUzDate(expiry);
  if (!iso) return null;
  const days = Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days < 0) return { kind: "expired" };
  return days < warnDays ? { kind: "soon", days } : null;
}

/** Enter/Tab: keyingi tahrirlanadigan katak; oxirgi qatordan keyin — null (Enter boʻlsa yangi qator). */
export function nextCell(keys: GridKey[], rows: number, row: number, key: GridKey, dir: 1 | -1): { row: number; key: GridKey } | null {
  let r = row;
  let k = keys.indexOf(key) + dir;
  if (k >= keys.length) {
    k = 0;
    r++;
  } else if (k < 0) {
    k = keys.length - 1;
    r--;
  }
  if (r < 0 || r >= rows) return null;
  return { row: r, key: keys[k] };
}
