/**
 * U10: bildirishnoma muhimligi. Qizil (harakat kerak) — tasdiq soʻrovi, kechikish, kamomad, muammo, topshiriq, muddat;
 * qolganlari (tasdiqlandi, rad etildi, yuborildi, xabar) — kulrang.
 */
const ACTION = /(approval|issue|shortage|late|overdue|due|wait|check|TASK|PRICE_BAD|accept$)/i;
const INFO = /(approved|rejected|accepted|sent|returned|idle)$/i;

export type Urgency = "action" | "info";

export function urgency(kind: string): Urgency {
  if (INFO.test(kind)) return "info";
  return ACTION.test(kind) ? "action" : "info";
}

export function unreadCounts(items: { kind: string; readAt?: string | null }[]): { action: number; info: number } {
  let action = 0;
  let info = 0;
  for (const n of items) {
    if (n.readAt) continue;
    if (urgency(n.kind) === "action") action++;
    else info++;
  }
  return { action, info };
}
