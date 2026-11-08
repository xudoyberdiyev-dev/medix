"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleCheck, CircleMinus, Download, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { PeriodPicker, usePeriodState } from "@/features/home/period-picker";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { rowField, useClientTable } from "@/lib/client-table";
import { useBranchStore } from "@/lib/stores/branch";

type Row = components["schemas"]["SupplierGoodsRow"];
const NO_ROWS: Row[] = [];
export type SupplierKind = components["schemas"]["SupplierGoodsView"]["kind"];

export const KIND_LABELS: Record<SupplierKind, string> = { STAFF: "Taʼminotchi xodim", COMPANY: "Taʼminotchi korxona" };

/** Hisobot ruxsati: reports.all yoki reports.view va tannarx (prices.cost) — hisobot butunlay tannarxda. */
export function canSeeSupplierGoods(perms: string[]): boolean {
  return (perms.includes("reports.all") || perms.includes("reports.view")) && perms.includes("prices.cost");
}

/** .xlsx eksport havolasi — sahifadagi filtrlar bilan. */
export function supplierGoodsExportHref(kind: SupplierKind, f: { branchId: number | null; from: string; to: string }): string {
  const p = new URLSearchParams({ kind });
  if (f.branchId != null) p.set("branchId", String(f.branchId));
  p.set("from", f.from);
  p.set("to", f.to);
  return `/api/reports/supplier-goods/export?${p.toString()}`;
}

const money = (v: string) => <span className="font-mono tabular-nums">{formatMoney(v)}</span>;

/** Taʼminotchi xodim («Kim nomiga») va korxona tovari, tannarxda: olib keldi / sotildi / boshqa / qoldi; Aktiv / Passiv. */
export function SupplierGoodsReportPage() {
  const t = useTranslations("reports");
  const me = useMe();
  const allowed = canSeeSupplierGoods(me.data?.permissions ?? []);
  const router = useRouter();
  const canOpenReceipts = (me.data?.permissions ?? []).includes("receipt.view");
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const period = usePeriodState();
  const { from, to } = period.range;
  const [kind, setKind] = useState<SupplierKind>("STAFF");
  const report = useQuery({
    queryKey: ["reports", "supplier-goods", kind, branchId, from, to],
    queryFn: () =>
      unwrap(
        api.GET("/api/reports/supplier-goods", {
          params: { query: { kind, branchId: branchId ?? undefined, from: from ?? undefined, to: to ?? undefined } },
        }),
      ),
    enabled: allowed && !!from && !!to,
  });

  const table = useClientTable(report.data?.rows ?? NO_ROWS, {
    value: (x, key) => (key === "active" ? (x.active ? 0 : 1) : rowField(x, key)),
  });

  if (me.data && !allowed) {
    return <ForbiddenState description={t("supplierGoods.forbidden")} />;
  }
  const r = report.data;
  const pageTitle = t("supplierGoods.title", { kind: t(`supplierGoods.kind.${kind}`) });
  const columns: TableColumn<Row>[] = [
    { key: "name", sortable: true, title: kind === "STAFF" ? t("supplierGoods.staffName") : t("supplierGoods.supplier") },
    {
      key: "active",
      sortable: true,
      title: t("supplierGoods.status"),
      render: (x) =>
        x.active ? (
          <Badge tone="success" icon={CircleCheck}>
            {t("supplierGoods.active")}
          </Badge>
        ) : (
          <Badge tone="neutral" icon={CircleMinus}>
            {t("supplierGoods.passive")}
          </Badge>
        ),
    },
    { key: "brought", sortable: true, title: t("supplierGoods.brought"), align: "right", render: (x) => money(x.brought) },
    { key: "sold", sortable: true, title: t("supplierGoods.sold"), align: "right", render: (x) => money(x.sold) },
    { key: "other", sortable: true, title: t("supplierGoods.other"), align: "right", render: (x) => money(x.other) },
    { key: "left", sortable: true, title: t("supplierGoods.left"), align: "right", render: (x) => money(x.left) },
  ];
  const totals: Record<string, React.ReactNode> | undefined = r
    ? {
        name: t("total"),
        brought: money(r.total.brought),
        sold: money(r.total.sold),
        other: money(r.total.other),
        left: money(r.total.left),
      }
    : undefined;

  return (
    <>
      <Link href="/reports" className="mb-2 inline-flex items-center gap-1 text-caption text-text-secondary hover:underline">
        <ArrowLeft size={14} strokeWidth={1.5} aria-hidden /> {t("back")}
      </Link>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-page-title">{pageTitle}</h1>
        <PeriodPicker state={period} />
      </div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          aria-label={t("supplierGoods.byWhom")}
          items={(Object.keys(KIND_LABELS) as SupplierKind[]).map((k) => ({ key: k, label: t(`supplierGoods.tab.${k}`) }))}
          value={kind}
          onChange={(k) => setKind(k as SupplierKind)}
        />
        <div className="flex items-center gap-4 text-caption text-text-secondary">
          {r ? (
            <span>
              {r.from === r.to ? formatIsoDate(r.from) : `${formatIsoDate(r.from)} – ${formatIsoDate(r.to)}`}
              {r.branchId == null ? ` · ${t("allBranches")}` : ""}
            </span>
          ) : null}
          {from && to ? (
            <a
              href={supplierGoodsExportHref(kind, { branchId, from, to })}
              download
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              <Download size={16} strokeWidth={1.5} aria-hidden /> {t("export")}
            </a>
          ) : null}
        </div>
      </div>
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={pageTitle}
          density="compact"
          columns={columns}
          rows={table.rows}
          sort={table.sort}
          onSortChange={table.onSortChange}
          pagination={table.pagination}
          rowKey={(x) => String(x.id)}
          onRowClick={
            kind === "COMPANY" && canOpenReceipts
              ? (x) => router.push(`/receipts?${new URLSearchParams({ supplierId: String(x.id), supplier: x.name }).toString()}`)
              : undefined
          }
          loading={report.isLoading}
          totals={r && r.rows.length > 0 ? totals : undefined}
          emptyState={<EmptyState icon={Truck} title={t("supplierGoods.emptyTitle")} description={t("emptyHint")} />}
        />
      )}
      <p className="mt-2 text-caption text-text-secondary">{t("supplierGoods.note")}</p>
    </>
  );
}
