"use client";

import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Banknote, ChevronRight, ClipboardList, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { type AttentionRow, CardTitle, nonZero, OrderStatuses, PaymentCard } from "./director-home";
import { PeriodPicker, usePeriodState } from "./period-picker";

type OperatorHomeView = components["schemas"]["OperatorHomeView"];
type CustomerRow = components["schemas"]["CustomerRow"];

export const REPORTS_OWN = "reports.own";

/** Operatorning «Diqqat talab qiladi» qatorlari: faqat oʻz buyurtmalari; nol boʻlganlari yashiriladi. */
export function operatorAttentionRows(a: OperatorHomeView["attention"]): AttentionRow[] {
  const rows: (AttentionRow & { count: number })[] = [
    {
      key: "rej",
      values: { days: a.rejectedDays, count: a.rejected.count },
      value: a.rejected.amount,
      count: a.rejected.count,
      href: "/orders?status=REJECTED&mine=1",
      money: true,
      danger: true,
    },
    {
      key: "draft",
      values: { count: a.drafts.count },
      value: a.drafts.amount,
      count: a.drafts.count,
      href: "/orders?status=DRAFT&mine=1",
      money: true,
    },
    {
      key: "pend",
      values: { count: a.pendingApproval.count },
      value: a.pendingApproval.amount,
      count: a.pendingApproval.count,
      href: "/orders?status=PENDING_APPROVAL&mine=1",
      money: true,
    },
    {
      key: "stale",
      values: { count: a.stale.count },
      value: a.stale.amount,
      count: a.stale.count,
      href: "/orders?mine=1",
      money: true,
    },
  ];
  return rows
    .filter((r) => r.count > 0)
    .map((r): AttentionRow => ({ key: r.key, values: r.values, value: r.value, href: r.href, money: r.money, danger: r.danger }));
}

/** Operator bosh sahifasi (SPEC 2, 8): oʻzi kiritgan buyurtmalar boʻyicha savdo, holatlar, «Diqqat talab qiladi», eng katta mijozlar. */
export function OperatorHome() {
  const t = useTranslations("home");
  const me = useMe();
  const allowed = can(me.data, REPORTS_OWN);
  const period = usePeriodState();
  const { from, to } = period.range;
  const home = useQuery({
    queryKey: ["home", "operator", from, to],
    queryFn: () => unwrap(api.GET("/api/home/operator", { params: { query: { from: from ?? undefined, to: to ?? undefined } } })),
    enabled: allowed && !!from && !!to,
    refetchInterval: 120_000,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  const h = home.data;

  return (
    <>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        <PeriodPicker state={period} />
      </div>
      {home.error ? (
        <ErrorState onRetry={() => home.refetch()} />
      ) : !h ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          <p className="text-caption text-text-secondary">
            {h.from === h.to ? formatIsoDate(h.from) : `${formatIsoDate(h.from)} – ${formatIsoDate(h.to)}`} · {t("operator.mineOnly")}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <PaymentCard icon={Banknote} title={t("operator.mySales")} note={t("card.salesNote")} value={h.sales} />
            <Card>
              <CardTitle icon={ClipboardList} title={t("operator.ordersCreated")} />
              <div className="mt-1 font-mono text-subtitle tabular-nums">{h.ordersCreated.count}</div>
              <div className="font-mono text-caption tabular-nums text-text-secondary">{formatMoney(h.ordersCreated.amount)}</div>
              <div className="mt-2 text-caption text-text-secondary">{t("operator.ordersCreatedNote")}</div>
              <Link href="/orders?mine=1" className="mt-2 inline-block text-caption text-primary-button hover:underline">
                {t("operator.openMyOrders")}
              </Link>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <OperatorAttention home={h} />
            <TopCustomers rows={h.topCustomers} />
          </div>
          <OrderStatuses cells={h.orderStatuses} staleDays={h.staleDays} hrefSuffix="&mine=1" />
        </div>
      )}
    </>
  );
}

function OperatorAttention({ home }: { home: OperatorHomeView }) {
  const t = useTranslations("home.attention");
  const rows = operatorAttentionRows(home.attention);
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <AlertTriangle size={18} strokeWidth={1.5} aria-hidden /> {t("title")}
      </h2>
      <Card flush>
        {rows.length === 0 ? (
          <EmptyState icon={AlertTriangle} title={t("allGood")} description={t("operatorEmpty")} />
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r) => (
              <li key={r.key}>
                <Link href={r.href} className="flex items-center justify-between gap-3 px-4 py-2.5 text-body hover:bg-background">
                  <span className={r.danger ? "text-danger" : ""}>{t(`rows.${r.key}`, r.values)}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono tabular-nums">{nonZero(r.value) ? formatMoney(r.value) : ""}</span>
                    <ChevronRight size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </section>
  );
}

function TopCustomers({ rows }: { rows: CustomerRow[] }) {
  const t = useTranslations("home.operator");
  const columns: TableColumn<CustomerRow>[] = [
    { key: "name", title: t("customer"), wrap: true },
    { key: "orders", title: t("orders"), align: "right", render: (c) => <span className="font-mono tabular-nums">{c.orders}</span> },
    {
      key: "sales",
      title: t("salesVat"),
      align: "right",
      render: (c) => <span className="font-mono tabular-nums">{formatMoney(c.sales)}</span>,
    },
  ];
  return (
    <section>
      <h2 className="mb-2 flex items-center gap-2 text-subtitle">
        <Users size={18} strokeWidth={1.5} aria-hidden /> {t("topCustomers")}
      </h2>
      <Table
        caption={t("topCustomersCaption")}
        density="compact"
        columns={columns}
        rows={rows}
        rowKey={(c) => String(c.id)}
        emptyState={<EmptyState icon={Users} title={t("noSales")} description={t("noSalesHint")} />}
      />
    </section>
  );
}
