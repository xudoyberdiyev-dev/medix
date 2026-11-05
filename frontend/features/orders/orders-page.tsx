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
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { ORDER_CREATE, STATUS_LABELS, WAREHOUSE_STAGES, useOrders, type OrderStatus, type OrderSummary } from "./api";
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

/** Buyurtmalar (SPEC 5.2): holat filtri, qidiruv (raqam, mijoz, STIR), «Mening buyurtmalarim». */
export function OrdersPage() {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const params = useSearchParams();
  const initialStatus = params.get("status");
  const [status, setStatus] = useState<string | null>(initialStatus);
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [mine, setMine] = useState(params.get("mine") === "1");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState<{ id: number | null } | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, ["orders.view", "approvals.view"]);
  const canCreate = can(me.data, ORDER_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const orders = useOrders({ branchId, status: (status as OrderStatus | null) ?? null, q, mine, page });

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

  const filtered = Boolean(status) || Boolean(q) || mine;
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
              <div className="w-56">
                <Select
                  label="Holat"
                  size="sm"
                  value={status}
                  onChange={(v) => (setStatus(v), setPage(1))}
                  placeholder="Barcha holatlar"
                  className="[&>span:first-child]:sr-only"
                  options={(Object.keys(STATUS_LABELS) as OrderStatus[]).map((value) => ({
                    value,
                    label: STATUS_LABELS[value],
                    sub: WAREHOUSE_STAGES.includes(value) ? "Ombor" : undefined,
                  }))}
                />
              </div>
              {canCreate ? <Checkbox label="Mening buyurtmalarim" checked={mine} onChange={(v) => (setMine(v), setPage(1))} /> : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setStatus(null), setSearch(""), setQ(""), setMine(false))} />
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
