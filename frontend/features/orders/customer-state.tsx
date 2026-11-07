"use client";

import { CircleCheck, Lock, Repeat, TriangleAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { day } from "./orders-page";

export type CustomerCredit = components["schemas"]["CustomerCredit"];
export type PreviousOrder = components["schemas"]["PreviousOrder"];

export function useCustomerCredit(warehouseId: number | null, customerId: number | null) {
  return useQuery({
    queryKey: ["orders", "customer-credit", warehouseId, customerId],
    queryFn: () =>
      unwrap(api.GET("/api/orders/customer-credit", { params: { query: { warehouseId: warehouseId ?? 0, customerId: customerId ?? 0 } } })),
    enabled: warehouseId !== null && customerId !== null,
  });
}

export function usePreviousOrders(customerId: number | null) {
  return useQuery({
    queryKey: ["orders", "previous", customerId],
    queryFn: () => unwrap(api.GET("/api/orders/previous", { params: { query: { customerId: customerId ?? 0 } } })),
    enabled: customerId !== null,
  });
}

export type CustomerVerdict =
  | { kind: "blocked" }
  | { kind: "approval"; reasons: ({ k: "limit"; over: string } | { k: "overdue"; sum: string; days: number })[] }
  | { kind: "ok" };

/** Mijoz qatori holati (prototip «Buyurtma kiritish»): bloklangan → yuborilmaydi; limit yoki muddati oʻtgan qarz → tasdiq kerak. */
export function customerVerdict(c: CustomerCredit, orderTotal: string): CustomerVerdict {
  if (c.blocked) return { kind: "blocked" };
  const reasons: Extract<CustomerVerdict, { kind: "approval" }>["reasons"] = [];
  if (c.limitLeft !== null && c.limitLeft !== undefined) {
    // Pul satr koʻrinishida keladi — tiyinlarda butun son bilan solishtiriladi (float yoʻq)
    const over = cents(orderTotal) - cents(c.limitLeft);
    if (cents(orderTotal) > 0 && over > 0) reasons.push({ k: "limit", over: fromCents(over) });
  }
  if (c.overdueDays > 0) reasons.push({ k: "overdue", sum: c.overdue, days: c.overdueDays });
  return reasons.length ? { kind: "approval", reasons } : { kind: "ok" };
}

function cents(s: string): bigint {
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s.trim());
  if (!m) return BigInt(0);
  const v = BigInt(m[2]) * BigInt(100) + BigInt((m[3] ?? "0").padEnd(2, "0"));
  return m[1] ? -v : v;
}

function fromCents(v: bigint): string {
  const neg = v < BigInt(0);
  const a = neg ? -v : v;
  const r = a % BigInt(100);
  return `${neg ? "-" : ""}${a / BigInt(100)}.${r.toString().padStart(2, "0")}`;
}

/** Mijoz qatori: nomi, holat belgisi, narx turi / qarz / muddati oʻtgan / limit / qolgan limit va xulosa. */
export function CustomerStateRow({ name, credit, orderTotal }: { name: string; credit: CustomerCredit | undefined; orderTotal: string }) {
  const t = useTranslations("orders");
  if (!credit) return <Skeleton className="h-28 w-full" />;
  const v = customerVerdict(credit, orderTotal);
  const overdue = credit.overdueDays > 0;
  const leftLow = credit.limitLeft !== null && credit.limitLeft !== undefined && cents(credit.limitLeft) < cents(orderTotal);
  const facts: { label: string; value: string; danger?: boolean }[] = [
    { label: t("credit.priceType"), value: credit.priceType ?? t("credit.basePrice") },
    { label: t("credit.debt"), value: formatMoney(credit.debt) },
    {
      label: t("credit.overdue"),
      value: overdue ? t("credit.overdueValue", { amount: formatMoney(credit.overdue), days: credit.overdueDays }) : t("credit.none"),
      danger: overdue,
    },
    { label: t("credit.limit"), value: credit.creditLimit ? formatMoney(credit.creditLimit) : t("credit.notSet") },
    { label: t("credit.limitLeft"), value: credit.limitLeft ? formatMoney(credit.limitLeft) : "—", danger: leftLow },
  ];
  const badge =
    v.kind === "blocked" ? (
      <Badge tone="danger" icon={Lock}>
        {t("customer.stBlocked")}
      </Badge>
    ) : v.kind === "approval" ? (
      <Badge tone="warning" icon={TriangleAlert}>
        {t("customer.stApproval")}
      </Badge>
    ) : (
      <Badge tone="success" icon={CircleCheck}>
        {t("customer.stOk")}
      </Badge>
    );
  const msg =
    v.kind === "blocked"
      ? t("customer.msgBlocked")
      : v.kind === "approval"
        ? t("customer.msgApproval", {
            reasons: v.reasons
              .map((r) =>
                r.k === "limit"
                  ? t("customer.rLimit", { amount: formatMoney(r.over) })
                  : t("customer.rOverdue", { amount: formatMoney(r.sum), days: r.days }),
              )
              .join("; "),
          })
        : t("customer.msgOk");
  const MsgIcon = v.kind === "blocked" ? Lock : v.kind === "approval" ? TriangleAlert : CircleCheck;
  const msgCls =
    v.kind === "blocked" ? "bg-danger-bg text-danger" : v.kind === "approval" ? "bg-warning-bg text-warning" : "bg-success-bg text-success";
  return (
    <section aria-label={t("customer.aria")} className="flex flex-col gap-2.5 rounded-card border border-border bg-surface px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="min-w-0 font-semibold">{name}</span>
        {badge}
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(104px,1fr))] gap-x-4 gap-y-2">
        {facts.map((f) => (
          <div key={f.label} className="flex min-w-0 flex-col">
            <dt className="text-caption text-text-secondary">{f.label}</dt>
            <dd className={`truncate font-medium tabular-nums ${f.danger ? "text-danger" : ""}`}>{f.value}</dd>
          </div>
        ))}
      </dl>
      {credit.controlledLicense === false ? (
        <div role="status" className="flex items-start gap-2 rounded-control bg-warning-bg px-2.5 py-2 text-caption text-warning">
          <TriangleAlert size={16} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden />
          <span>{t("customer.noLicense")}</span>
        </div>
      ) : null}
      <div role="status" className={`flex items-start gap-2 rounded-control px-2.5 py-2 text-caption ${msgCls}`}>
        <MsgIcon size={16} strokeWidth={1.5} className="mt-px shrink-0" aria-hidden />
        <span className="min-w-0 flex-1">{msg}</span>
      </div>
    </section>
  );
}

/** «Oxirgi buyurtmalar»: Takrorlash — qatorlarni joriy buyurtmaga qoʻshadi (Alt+1…5). */
export function RecentOrders({
  customerId,
  onRepeat,
  note,
  busy,
}: {
  customerId: number;
  onRepeat: (o: PreviousOrder) => void;
  note: string | null;
  busy: boolean;
}) {
  const t = useTranslations("orders");
  const list = usePreviousOrders(customerId);
  const items = (list.data ?? []).slice(0, 5);
  const ref = useRef({ items, onRepeat, busy });
  useEffect(() => {
    ref.current = { items, onRepeat, busy };
  });
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number(e.code.startsWith("Digit") ? e.code.slice(5) : e.key);
      const o = Number.isInteger(n) && n >= 1 && n <= 5 ? ref.current.items[n - 1] : undefined;
      if (!o || ref.current.busy) return;
      e.preventDefault();
      ref.current.onRepeat(o);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  if (list.isPending || items.length === 0) return null;
  return (
    <section aria-label={t("customer.recent")} className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-border px-4 py-3">
        <span className="font-semibold">{t("customer.recent")}</span>
        <span className="text-caption text-text-secondary">{t("customer.recentSub")}</span>
      </div>
      <ul className="flex flex-col py-1">
        {items.map((o, i) => {
          const more = o.lines - o.products.length;
          const names = o.products.join(", ") + (more > 0 ? ` +${more}` : "");
          return (
            <li
              key={o.id}
              className="grid min-h-11 grid-cols-[8rem_minmax(0,1fr)_8rem_auto] items-center gap-3 py-1 pr-3 pl-4 hover:bg-table-header"
            >
              <span className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{o.number}</span>
                <span className="text-caption text-text-secondary">{day(o.orderDate)}</span>
              </span>
              <span title={names} className="truncate text-text-secondary">
                {names}
              </span>
              <span className="text-right font-medium tabular-nums">{formatMoney(o.total)}</span>
              <Button
                variant="secondary"
                size="sm"
                icon={Repeat}
                disabled={busy}
                aria-keyshortcuts={`Alt+${i + 1}`}
                title={`Alt+${i + 1}`}
                onClick={() => onRepeat(o)}
              >
                {t("customer.repeat")}
                <span className="ml-1 text-caption font-normal text-text-secondary">Alt+{i + 1}</span>
              </Button>
            </li>
          );
        })}
      </ul>
      {note ? <p className="mx-3 mb-3 rounded-control bg-background px-2.5 py-2 text-caption text-text-secondary">{note}</p> : null}
    </section>
  );
}
