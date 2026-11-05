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
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { type TabItem, Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ORDER_CREATE, STATUS_LABELS, useOrders, type OrderStatus, type OrderSummary } from "./api";
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
  const s = STATUS_STYLE[status];
  return (
    <Badge tone={s.tone} icon={s.icon}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

const ALL = "ALL";
type StatusCount = components["schemas"]["StatusCount"];

/** Holat yorliqlari: «Hammasi» + 13 holat, har birida soni (summasi — tanlangan yorliq ostida). */
export function statusTabs(counts: StatusCount[]): TabItem[] {
  return counts.map((c) => ({
    key: c.status ?? ALL,
    label: c.status ? STATUS_LABELS[c.status] : "Hammasi",
    count: c.count,
  }));
}

export function tabSummary(counts: StatusCount[], status: string | null): string {
  const c = counts.find((x) => (x.status ?? null) === status) ?? counts[0];
  if (!c) return "";
  return `${c.status ? STATUS_LABELS[c.status] : "Hammasi"}: ${formatQuantity(c.count)} ta · ${formatMoney(c.total)} soʻm`;
}

/** Buyurtmalar (SPEC 5.2): holat yorliqlari (soni, summasi), «Hozir kimda», qidiruv (raqam, mijoz, STIR), «Mening buyurtmalarim». */
export function OrdersPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(params.get("mine") === "1");
  // Hisobotdan oʻtish: ?customerId=…&customer=Nomi (Savdo hisoboti — mijoz qatori)
  const [customer, setCustomer] = useState<{ id: number; name: string } | null>(() => {
    const id = Number(params.get("customerId"));
    return Number.isInteger(id) && id > 0 ? { id, name: params.get("customer") ?? `Mijoz #${id}` } : null;
  });
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, ["orders.view", "approvals.view"]);
  const canCreate = can(me.data, ORDER_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const orders = useOrders({ branchId, status: (status as OrderStatus | null) ?? null, q, mine, page, customerId: customer?.id ?? null });

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const columns: TableColumn<OrderSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "orderDate", title: "Sana", render: (o) => day(o.orderDate) },
    { key: "customer", title: "Mijoz" },
    {
      key: "deliveryType",
      title: "Yetkazish",
      render: (o) =>
        o.deliveryType === "PICKUP" ? "Oʻzi olib ketadi" : o.deliveryDate ? `Yetkazib berish · ${day(o.deliveryDate)}` : "Yetkazib berish",
    },
    { key: "lines", title: "Qatorlar", align: "right", render: (o) => <span className="tabular-nums">{formatQuantity(o.lines)}</span> },
    { key: "total", title: "Summa", align: "right", render: (o) => <span className="tabular-nums">{formatMoney(o.total)}</span> },
    { key: "createdBy", title: "Operator" },
    { key: "holder", title: "Hozir kimda", render: (o) => <span className="text-caption text-text-secondary">{o.holder}</span> },
    {
      key: "status",
      title: "Holat",
      render: (o) => (
        <span className="flex items-center gap-2">
          <OrderStatusBadge status={o.status} />
          {o.approvalLevel === "DIRECTOR" && o.status === "PENDING_APPROVAL" ? <Badge tone="warning">Direktor</Badge> : null}
        </span>
      ),
    },
  ];

  const filtered = Boolean(status) || Boolean(q) || mine || customer != null;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Buyurtmalar</h1>
        {canCreate ? (
          <Button icon={Plus} onClick={() => setEditor({ id: null })}>
            Buyurtma kiritish
          </Button>
        ) : null}
      </div>
      {orders.data ? (
        <div className="mb-3 flex flex-col gap-2">
          <Tabs
            aria-label="Buyurtma holatlari"
            items={statusTabs(orders.data.statuses)}
            value={status ?? ALL}
            onChange={(k) => (setStatus(k === ALL ? null : k), setPage(1))}
          />
          <p className="text-caption text-text-secondary tabular-nums">{tabSummary(orders.data.statuses, status)}</p>
        </div>
      ) : null}
      {orders.error ? (
        <ErrorState onRetry={() => orders.refetch()} />
      ) : (
        <Table
          caption="Buyurtmalar"
          columns={columns}
          rows={orders.data?.items ?? []}
          rowKey={(o) => String(o.id)}
          loading={orders.isPending}
          onRowClick={(o) => setEditor({ id: o.id })}
          toolbar={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-80">
                <TextField
                  label="Qidirish"
                  variant="search"
                  size="sm"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    clearTimeout(debounce.current);
                    debounce.current = setTimeout(() => (setQ(v.trim()), setPage(1)), 300);
                  }}
                  placeholder="Raqam, mijoz yoki STIR"
                  className="[&>label]:sr-only"
                />
              </div>
              {canCreate ? <Checkbox label="Mening buyurtmalarim" checked={mine} onChange={(v) => (setMine(v), setPage(1))} /> : null}
              {customer ? (
                <span className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-caption">
                  Mijoz: {customer.name}
                  <button
                    type="button"
                    aria-label="Mijoz filtrini olib tashlash"
                    className="text-text-secondary hover:text-text-primary"
                    onClick={() => (setCustomer(null), setPage(1))}
                  >
                    <X size={14} strokeWidth={1.5} aria-hidden />
                  </button>
                </span>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setStatus(null), setSearch(""), setQ(""), setMine(false), setCustomer(null))} />
            ) : (
              <EmptyState
                icon={ClipboardList}
                title="Hali buyurtma yoʻq"
                description="Operator mijoz va mahsulotlarni tanlab buyurtma kiritadi. Limit yoki qarz boʻlsa — tasdiqqa ketadi."
              />
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
