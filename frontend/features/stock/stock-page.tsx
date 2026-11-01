"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Boxes, CalendarClock, CircleAlert, Clock, Download, Lock, ShoppingCart } from "lucide-react";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { KpiCard } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useWarehouses } from "@/features/organization/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";

type StockRow = components["schemas"]["StockRow"];

/** Yaroqlilik holati: oʻtgan / 90 kun ichida / yaroqli (SPEC 9: holat = ikonka + soʻz + rang). */
export function expiryState(daysLeft: number): "expired" | "expiring" | "valid" {
  if (daysLeft < 0) return "expired";
  if (daysLeft <= 90) return "expiring";
  return "valid";
}

function ExpiryBadge({ row }: { row: StockRow }) {
  const s = expiryState(row.daysLeft);
  const date = formatDate(new Date(`${row.expiryDate}T00:00:00+05:00`));
  if (s === "expired")
    return (
      <Badge tone="danger" icon={CircleAlert}>
        Oʻtgan · {date}
      </Badge>
    );
  if (s === "expiring")
    return (
      <Badge tone="warning" icon={Clock}>
        {date} · {row.daysLeft} kun
      </Badge>
    );
  return <span className="tabular-nums">{date}</span>;
}

/** Eksport havolasi — jadvaldagi filtrlar bilan (server ham filial doirasi va tannarx ruxsatini tekshiradi). */
export function stockExportHref(f: { q: string; warehouseId: string | null; sellableOnly: boolean; expiringWithinDays?: number }): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.warehouseId) p.set("warehouseId", f.warehouseId);
  if (f.sellableOnly) p.set("sellableOnly", "true");
  if (f.expiringWithinDays !== undefined) p.set("expiringWithinDays", String(f.expiringWithinDays));
  const qs = p.toString();
  return `/api/stock/export${qs ? `?${qs}` : ""}`;
}

/** Qoldiqlar (mode="stock") va Muddat nazorati (mode="expiry") — bitta jadval, turli filtr. */
export function StockPage({ mode }: { mode: "stock" | "expiry" }) {
  const me = useMe();
  const warehouses = useWarehouses();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [sellableOnly, setSellableOnly] = useState(false);
  const [days, setDays] = useState<string | null>("90");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<25 | 50 | 100>(50);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const allowed = canAny(me.data, mode === "stock" ? ["stock.view"] : ["expiry.view", "stock.view"]);

  const stock = useQuery({
    queryKey: ["stock", mode, q, warehouseId, sellableOnly, days, page, size],
    queryFn: () =>
      unwrap(
        api.GET("/api/stock", {
          params: {
            query: {
              q: q || undefined,
              warehouseId: warehouseId ? Number(warehouseId) : undefined,
              sellableOnly,
              expiringWithinDays: mode === "expiry" ? Number(days ?? 90) : undefined,
              page: page - 1,
              size,
            },
          },
        }),
      ),
    enabled: allowed,
    placeholderData: keepPreviousData,
  });

  if (me.data && !allowed) return <ForbiddenState description="Bu sahifa sizning rolingiz uchun yopiq." />;

  const showCost = (stock.data?.items ?? []).some((r) => r.cost != null);
  const columns: TableColumn<StockRow>[] = [
    { key: "productCode", title: "Kod", mono: true, width: 100 },
    {
      key: "productName",
      title: "Mahsulot",
      render: (r) => (
        <span className="flex flex-col">
          <span>{r.productName}</span>
          {r.manufacturer ? <span className="text-caption text-text-secondary">{r.manufacturer}</span> : null}
        </span>
      ),
    },
    {
      key: "batchNumber",
      title: "Partiya",
      mono: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.batchNumber}
          {r.bonus ? <Badge tone="info">Bonus</Badge> : null}
        </span>
      ),
    },
    { key: "expiryDate", title: "Yaroqlilik", render: (r) => <ExpiryBadge row={r} /> },
    { key: "warehouse", title: "Ombor" },
    {
      key: "zone",
      title: "Zona",
      render: (r) => (
        <span title={r.sellable ? "Sotuvga ochiq" : "Sotuvga yopiq"}>
          <Badge tone={r.sellable ? "success" : "neutral"} icon={r.sellable ? ShoppingCart : Lock}>
            {r.zone}
          </Badge>
        </span>
      ),
    },
    { key: "qty", title: "Miqdor", align: "right", render: (r) => <span className="tabular-nums">{formatQuantity(r.qty)}</span> },
    ...(showCost
      ? [{ key: "cost", title: "Tannarx", align: "right" as const, render: (r: StockRow) => (r.cost ? formatMoney(r.cost) : "") }]
      : []),
  ];

  const filtered = Boolean(q) || Boolean(warehouseId) || sellableOnly;
  const exportHref = stockExportHref({
    q,
    warehouseId,
    sellableOnly,
    expiringWithinDays: mode === "expiry" ? Number(days ?? 90) : undefined,
  });
  return (
    <>
      <h1 className="mb-4 text-page-title">{mode === "stock" ? "Qoldiqlar" : "Muddat nazorati"}</h1>
      {stock.data ? (
        <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
          <KpiCard
            label={mode === "stock" ? "Qatorlar (zona × partiya)" : "Muddati yaqin / oʻtgan qatorlar"}
            icon={mode === "stock" ? Boxes : CalendarClock}
            value={formatQuantity(stock.data.total)}
            unit="ta"
          />
          <KpiCard label="Jami miqdor" value={formatQuantity(stock.data.totalQty)} unit="dona" note="Filtr boʻyicha" />
        </div>
      ) : null}
      {stock.error ? (
        <ErrorState onRetry={() => stock.refetch()} />
      ) : (
        <Table
          caption={mode === "stock" ? "Qoldiqlar" : "Muddat nazorati"}
          columns={columns}
          rows={stock.data?.items ?? []}
          rowKey={(r) => `${r.zoneId}:${r.batchId}`}
          loading={stock.isPending}
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
                  placeholder="Mahsulot, kod yoki partiya"
                  className="[&>label]:sr-only"
                />
              </div>
              <div className="w-56">
                <Select
                  label="Ombor"
                  size="sm"
                  value={warehouseId}
                  onChange={(v) => (setWarehouseId(v), setPage(1))}
                  placeholder="Barcha omborlar"
                  className="[&>span:first-child]:sr-only"
                  options={(warehouses.data ?? []).map((w) => ({ value: String(w.id), label: w.name }))}
                />
              </div>
              {mode === "expiry" ? (
                <div className="w-48">
                  <Select
                    label="Muddat"
                    size="sm"
                    value={days}
                    onChange={(v) => (setDays(v), setPage(1))}
                    className="[&>span:first-child]:sr-only"
                    options={[
                      { value: "0", label: "Faqat oʻtganlar" },
                      { value: "30", label: "30 kun ichida" },
                      { value: "90", label: "90 kun ichida" },
                      { value: "180", label: "180 kun ichida" },
                    ]}
                  />
                </div>
              ) : null}
              <Checkbox label="Faqat sotuvga ochiq zonalar" checked={sellableOnly} onChange={(v) => (setSellableOnly(v), setPage(1))} />
              {stock.data && stock.data.total > 0 ? (
                <a href={exportHref} download className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
                  <Download size={16} strokeWidth={1.5} aria-hidden />
                  Excelʼga yuklab olish
                </a>
              ) : null}
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setSearch(""), setQ(""), setWarehouseId(null), setSellableOnly(false))} />
            ) : mode === "stock" ? (
              <EmptyState
                icon={Boxes}
                title="Qoldiq yoʻq"
                description="Qoldiq faqat oʻtkazilgan hujjatlar (kirim, boshlangʻich qoldiq) orqali paydo boʻladi."
              />
            ) : (
              <EmptyState
                icon={CalendarClock}
                title="Muddati yaqin tovar yoʻq"
                description="Tanlangan muddat ichida tugaydigan partiyalar topilmadi."
              />
            )
          }
          pagination={
            stock.data && stock.data.total > 0
              ? { page, pageSize: size, total: stock.data.total, onPageChange: setPage, onPageSizeChange: (s) => (setSize(s), setPage(1)) }
              : undefined
          }
        />
      )}
    </>
  );
}
