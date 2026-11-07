"use client";

import { useSearchParams } from "next/navigation";
import {
  Ban,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  FilePen,
  ListOrdered,
  PackageCheck,
  PackageX,
  Plus,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { FilterChip } from "@/components/ui/filter-chip";
import { Table, type TableColumn } from "@/components/ui/table";
import { type TabItem, Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { idParam } from "@/lib/url-filters";
import { useBranchStore } from "@/lib/stores/branch";
import { ORDER_CREATE, useOrders, type OrderStatus, type OrderSummary } from "./api";
import type { OrdersT } from "./i18n";
import { OrderDrawer } from "./order-drawer";

const STATUS_STYLE: Record<OrderStatus, { tone: "neutral" | "warning" | "info" | "success" | "danger"; icon: LucideIcon }> = {
  DRAFT: { tone: "neutral", icon: FilePen },
  PENDING_APPROVAL: { tone: "warning", icon: Clock },
  QUEUED: { tone: "info", icon: ListOrdered },
  PICKING: { tone: "info", icon: ClipboardList },
  MARKING: { tone: "info", icon: ClipboardList },
  CHECKING: { tone: "info", icon: PackageCheck },
  DOCUMENTING: { tone: "info", icon: FilePen },
  LOADING: { tone: "info", icon: Truck },
  IN_TRANSIT: { tone: "info", icon: Truck },
  DELIVERED: { tone: "success", icon: CircleCheck },
  UNDELIVERED: { tone: "danger", icon: PackageX },
  REJECTED: { tone: "danger", icon: CircleX },
  CANCELLED: { tone: "neutral", icon: Ban },
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const t = useTranslations("orders");
  const s = STATUS_STYLE[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

const ALL = "ALL";
type StatusCount = components["schemas"]["StatusCount"];

/** Holat yorliqlari: «Hammasi» + 13 holat, har birida soni (summasi — tanlangan yorliq ostida). */
export function statusTabs(counts: StatusCount[], t: OrdersT): TabItem[] {
  return counts.map((c) => ({
    key: c.status ?? ALL,
    label: c.status ? t(`status.${c.status}`) : t("list.all"),
    count: c.count,
  }));
}

export function tabSummary(counts: StatusCount[], status: string | null, t: OrdersT): string {
  const c = counts.find((x) => (x.status ?? null) === status) ?? counts[0];
  if (!c) return "";
  return t("list.summary", {
    label: c.status ? t(`status.${c.status}`) : t("list.all"),
    count: formatQuantity(c.count),
    amount: formatMoney(c.total),
  });
}

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** ?soldFrom=YYYY-MM-DD&soldTo=YYYY-MM-DD — shu davrda sotilgan yoki qaytarilgan buyurtmalar (hisobot bilan bir xil). */
export function soldParam(params: Pick<URLSearchParams, "get">): { from: string | null; to: string | null } | null {
  const from = params.get("soldFrom");
  const to = params.get("soldTo");
  const f = from && ISO_DAY.test(from) ? from : null;
  const t = to && ISO_DAY.test(to) ? to : null;
  return f || t ? { from: f, to: t } : null;
}

export function soldLabel(s: { from: string | null; to: string | null }, t: OrdersT): string {
  if (s.from && s.from === s.to) return t("list.soldOn", { date: day(s.from) });
  if (s.from && s.to) return t("list.soldRange", { from: day(s.from), to: day(s.to) });
  return s.from ? t("list.soldFrom", { date: day(s.from) }) : t("list.soldTo", { date: day(s.to ?? "") });
}

/** Buyurtmalar (SPEC 5.2): holat yorliqlari (soni, summasi), «Hozir kimda», qidiruv (raqam, mijoz, STIR), «Mening buyurtmalarim». */
export function OrdersPage() {
  const t = useTranslations("orders");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(params.get("mine") === "1");
  // Hisobotdan oʻtish (Savdo hisoboti qatori): mijoz, operator, sotuv davri
  const [customer, setCustomer] = useState(() => idParam(params, "customerId", "customer", t("list.customer")));
  const [operator, setOperator] = useState(() => idParam(params, "operatorId", "operator", t("list.operator")));
  const [sold, setSold] = useState(() => soldParam(params));
  const [page, setPage] = useState(1);
  // Bildirishnomadan oʻtish: ?open=<id> — buyurtma kartochkasi darhol ochiladi
  const [editor, setEditor] = useState<{ id: number | null } | null>(() => {
    const id = Number(params.get("open"));
    return Number.isInteger(id) && id > 0 ? { id } : null;
  });
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, ["orders.view", "approvals.view"]);
  const canCreate = can(me.data, ORDER_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const orders = useOrders({
    branchId,
    status: (status as OrderStatus | null) ?? null,
    q,
    mine,
    page,
    customerId: customer?.id ?? null,
    operatorId: operator?.id ?? null,
    soldFrom: sold?.from ?? null,
    soldTo: sold?.to ?? null,
  });

  if (me.data && !allowed) return <ForbiddenState description={t("list.forbidden")} />;

  const columns: TableColumn<OrderSummary>[] = [
    { key: "number", title: t("list.col.number"), mono: true },
    { key: "orderDate", title: t("list.col.date"), render: (o) => day(o.orderDate) },
    { key: "customer", title: t("list.col.customer") },
    {
      key: "deliveryType",
      title: t("list.col.delivery"),
      render: (o) =>
        o.deliveryType === "PICKUP"
          ? t("list.pickup")
          : o.deliveryDate
            ? t("list.deliveryOn", { date: day(o.deliveryDate) })
            : t("list.delivery"),
    },
    {
      key: "lines",
      title: t("list.col.lines"),
      align: "right",
      render: (o) => <span className="tabular-nums">{formatQuantity(o.lines)}</span>,
    },
    {
      key: "total",
      title: t("list.col.total"),
      align: "right",
      render: (o) => <span className="tabular-nums">{formatMoney(o.total)}</span>,
    },
    {
      key: "paymentType",
      title: t("list.col.paymentType"),
      render: (o) => t(`paymentType.${o.paymentType}`),
    },
    { key: "createdBy", title: t("list.col.operator") },
    { key: "holder", title: t("list.col.holder"), render: (o) => <span className="text-caption text-text-secondary">{o.holder}</span> },
    {
      key: "status",
      title: t("list.col.status"),
      render: (o) => (
        <span className="flex items-center gap-2">
          <OrderStatusBadge status={o.status} />
          {o.approvalLevel === "DIRECTOR" && o.status === "PENDING_APPROVAL" ? <Badge tone="warning">{t("list.director")}</Badge> : null}
        </span>
      ),
    },
  ];

  const filtered = Boolean(status) || Boolean(q) || mine || customer != null || operator != null || sold != null;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("list.title")}</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setEditor({ id: null })}>
            {t("list.create")}
          </Button>
        ) : null}
      </div>
      {orders.data ? (
        <div className="mb-3 flex flex-col gap-2">
          <Tabs
            aria-label={t("list.statusTabs")}
            items={statusTabs(orders.data.statuses, t)}
            value={status ?? ALL}
            onChange={(k) => (setStatus(k === ALL ? null : k), setPage(1))}
          />
          <p className="text-caption text-text-secondary tabular-nums">{tabSummary(orders.data.statuses, status, t)}</p>
        </div>
      ) : null}
      {orders.error ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : (
        <Table
          caption={t("list.title")}
          columns={columns}
          rows={orders.data?.items ?? []}
          rowKey={(o) => String(o.id)}
          loading={orders.isPending}
          onRowClick={(o) => setEditor({ id: o.id })}
          toolbar={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-80">
                <TextField
                  label={t("list.search")}
                  variant="search"
                  size="sm"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    clearTimeout(debounce.current);
                    debounce.current = setTimeout(() => (setQ(v.trim()), setPage(1)), 300);
                  }}
                  placeholder={t("list.searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              {canCreate ? <Checkbox label={t("list.mine")} checked={mine} onChange={(v) => (setMine(v), setPage(1))} /> : null}
              {customer ? (
                <FilterChip
                  label={t("list.customerChip", { name: customer.name })}
                  what={t("list.customer")}
                  onClear={() => (setCustomer(null), setPage(1))}
                />
              ) : null}
              {operator ? (
                <FilterChip
                  label={t("list.operatorChip", { name: operator.name })}
                  what={t("list.operator")}
                  onClear={() => (setOperator(null), setPage(1))}
                />
              ) : null}
              {sold ? (
                <FilterChip label={soldLabel(sold, t)} what={t("list.soldPeriod")} onClear={() => (setSold(null), setPage(1))} />
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState
                onClearFilters={() => (
                  setStatus(null),
                  setSearch(""),
                  setQ(""),
                  setMine(false),
                  setCustomer(null),
                  setOperator(null),
                  setSold(null)
                )}
              />
            ) : (
              <EmptyState icon={ClipboardList} title={t("list.emptyTitle")} description={t("list.emptyHint")} />
            )
          }
          pagination={
            orders.data && orders.data.total > 50
              ? {
                  page,
                  pageSize: 50,
                  total: orders.data.total,
                  onPageChange: setPage,
                  onPageSizeChange: () => undefined,
                  pageSizeOptions: [50],
                }
              : undefined
          }
        />
      )}
      {editor ? <OrderDrawer id={editor.id} onClose={() => setEditor(null)} onCreated={(id) => setEditor({ id })} /> : null}
    </>
  );
}
