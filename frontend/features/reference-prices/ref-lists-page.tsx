"use client";

import { FileSpreadsheet, TriangleAlert, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { PRICES_REFERENCE, useRefLists, type RefList } from "./api";

/** O14: «Referent narxlar» — yuklangan fayllar tarixi; qator → solishtirish natijasi. */
export function RefListsPage() {
  const t = useTranslations("referencePrices");
  const router = useRouter();
  const me = useMe();
  const allowed = can(me.data, PRICES_REFERENCE);
  const lists = useRefLists(allowed);
  if (me.data && !allowed) return <ForbiddenState />;
  const columns: TableColumn<RefList>[] = [
    {
      key: "file",
      title: t("cFile"),
      render: (r) => (
        <span className="flex items-center gap-2 font-medium">
          <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
          {r.fileName}
        </span>
      ),
    },
    { key: "at", title: t("cAt"), width: 150, render: (r) => formatDateTime(new Date(r.uploadedAt)) },
    { key: "by", title: t("cBy"), width: 180, render: (r) => r.uploadedBy },
    { key: "rows", title: t("cRows"), align: "right", width: 100, render: (r) => formatQuantity(r.rowCount) },
    { key: "matched", title: t("cMatched"), align: "right", width: 120, render: (r) => formatQuantity(r.matched) },
    {
      key: "check",
      title: t("cCheck"),
      width: 150,
      render: (r) =>
        r.needsCheck > 0 ? (
          <Badge tone="warning" icon={TriangleAlert}>
            {t("checkN", { n: r.needsCheck })}
          </Badge>
        ) : (
          <span className="text-text-secondary">—</span>
        ),
    },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-title">{t("title")}</h1>
          <p className="mt-1 text-table text-text-secondary">{t("sub")}</p>
        </div>
        <Button icon={Upload} onClick={() => router.push("/reference-prices/upload")}>
          {t("upload")}
        </Button>
      </div>
      {lists.error ? (
        <ErrorState error={lists.error} onRetry={() => lists.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={lists.data ?? []}
          rowKey={(r) => String(r.id)}
          loading={lists.isLoading}
          onRowClick={(r) => router.push(`/reference-prices/${r.id}`)}
          emptyState={<EmptyState icon={FileSpreadsheet} title={t("empty")} description={t("emptyD")} />}
        />
      )}
    </div>
  );
}
