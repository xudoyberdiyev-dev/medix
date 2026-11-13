"use client";

import { Archive, CircleCheck, CircleSlash, FileDown, PackageCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { DayField } from "@/components/ui/day-field";
import { Modal } from "@/components/ui/modal";
import type { PageSize } from "@/components/ui/pagination";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime } from "@/lib/format";
import { day } from "@/features/orders/orders-page";
import {
  reserveExportUrl,
  useCloseReserveCode,
  useReserveCodes,
  ZCODES_EDIT,
  ZCODES_VIEW,
  type ReserveCode,
  type ReserveFilter,
  type ReserveStatus,
} from "./api";

const TONE: Record<ReserveStatus, "info" | "success" | "neutral"> = { IN_RESERVE: "info", USED: "success", WRITTEN_OFF: "neutral" };
const ICON = { IN_RESERVE: Archive, USED: CircleCheck, WRITTEN_OFF: CircleSlash } as const;

export function StatusBadge({ status }: { status: ReserveStatus }) {
  const t = useTranslations("reserveCodes");
  return (
    <Badge tone={TONE[status]} icon={ICON[status]}>
      {t(`status.${status}`)}
    </Badge>
  );
}

/** O10c «Zaxira kodlar» (Ombor guruhi): roʻyxat, filtrlar, Excel, «Ishlatildi» / «Hisobdan chiqarish» (izoh bilan). */
export function ReserveCodesPage() {
  const t = useTranslations("reserveCodes");
  const me = useMe();
  const branches = useBranchList();
  const [f, setF] = useState<ReserveFilter>({ status: "IN_RESERVE", branchId: null, from: null, to: null, q: "" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(50);
  const [closing, setClosing] = useState<{ code: ReserveCode; action: "use" | "writeOff" } | null>(null);
  const list = useReserveCodes(f, page, size);
  const canEdit = can(me.data, ZCODES_EDIT);
  if (me.data && !can(me.data, ZCODES_VIEW)) return <ForbiddenState />;

  function apply(patch: Partial<ReserveFilter>) {
    setF((x) => ({ ...x, ...patch }));
    setPage(1);
  }
  const filtered = f.q.trim() !== "" || f.from !== null || f.to !== null || f.branchId !== null;
  const d = list.data;

  const columns: TableColumn<ReserveCode>[] = [
    {
      key: "product",
      title: t("col.product"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-medium">{z.productName}</span>
          <span className="font-mono text-caption text-text-secondary" title={z.code}>
            {z.gtin} · {z.serial}
          </span>
        </div>
      ),
    },
    {
      key: "batch",
      title: t("col.batch"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-mono">{z.batch}</span>
          {z.expiryDate ? <span className="text-caption text-text-secondary">{day(z.expiryDate)}</span> : null}
        </div>
      ),
    },
    {
      key: "order",
      title: t("col.order"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-mono">{z.orderNumber}</span>
          <span className="text-caption text-text-secondary">{z.customer}</span>
        </div>
      ),
    },
    ...(me.data?.allBranches ? [{ key: "branch", title: t("col.branch"), render: (z: ReserveCode) => z.branch }] : []),
    { key: "createdAt", title: t("col.date"), render: (z) => formatDateTime(new Date(z.createdAt)) },
    {
      key: "status",
      title: t("col.status"),
      render: (z) => (
        <div className="flex flex-col items-start gap-0.5">
          <StatusBadge status={z.status} />
          {z.note ? (
            <span className="text-caption text-text-secondary">
              {z.note}
              {z.changedBy ? ` · ${z.changedBy}` : ""}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-caption text-text-secondary">{t("subtitle")}</p>
        </div>
        <a
          href={reserveExportUrl(f)}
          download
          className="inline-flex h-control-md shrink-0 items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
        >
          <FileDown size={16} strokeWidth={1.5} aria-hidden />
          {t("excel")}
        </a>
      </div>
      <Tabs
        aria-label={t("tabsAria")}
        value={f.status ?? "ALL"}
        onChange={(k) => apply({ status: k === "ALL" ? null : (k as ReserveStatus) })}
        items={[
          { key: "IN_RESERVE", label: t("status.IN_RESERVE"), count: d ? d.inReserve : undefined },
          { key: "USED", label: t("status.USED"), count: d ? d.used : undefined },
          { key: "WRITTEN_OFF", label: t("status.WRITTEN_OFF"), count: d ? d.writtenOff : undefined },
          { key: "ALL", label: t("all") },
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={d?.items ?? []}
          rowKey={(z) => String(z.id)}
          loading={list.isPending}
          toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={f.q}
                  onChange={(q) => apply({ q })}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              {me.data?.allBranches ? (
                <div className="w-56">
                  <Select
                    label={t("branch")}
                    size="sm"
                    value={f.branchId === null ? null : String(f.branchId)}
                    onChange={(v) => apply({ branchId: v ? Number(v) : null })}
                    placeholder={t("allBranches")}
                    options={(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
                  />
                </div>
              ) : null}
              <DayField label={t("from")} value={f.from} invalid={t("dateInvalid")} onApply={(from) => apply({ from })} />
              <DayField label={t("to")} value={f.to} invalid={t("dateInvalid")} onApply={(to) => apply({ to })} />
            </div>
          }
          rowActions={
            canEdit
              ? (z) =>
                  z.status === "IN_RESERVE" ? (
                    <RowMenu
                      items={[
                        {
                          key: "use",
                          label: t("use"),
                          icon: <PackageCheck size={16} strokeWidth={1.5} aria-hidden />,
                          onSelect: () => setClosing({ code: z, action: "use" }),
                        },
                        {
                          key: "writeOff",
                          label: t("writeOff"),
                          icon: <CircleSlash size={16} strokeWidth={1.5} aria-hidden />,
                          onSelect: () => setClosing({ code: z, action: "writeOff" }),
                        },
                      ]}
                    />
                  ) : null
              : undefined
          }
          pagination={
            d
              ? {
                  page,
                  pageSize: size,
                  total: d.total,
                  onPageChange: setPage,
                  onPageSizeChange: (s) => (setSize(s), setPage(1)),
                }
              : undefined
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => apply({ q: "", from: null, to: null, branchId: null })} />
            ) : (
              <EmptyState icon={Archive} title={t("emptyTitle")} description={t("emptyDescription")} />
            )
          }
        />
      )}
      {closing ? <CloseDialog code={closing.code} action={closing.action} onClose={() => setClosing(null)} /> : null}
    </>
  );
}

function CloseDialog({ code, action, onClose }: { code: ReserveCode; action: "use" | "writeOff"; onClose: () => void }) {
  const t = useTranslations("reserveCodes");
  const close = useCloseReserveCode();
  const [note, setNote] = useState("");
  const [local, setLocal] = useState<string | undefined>();
  const err = describeError(close.error);
  function submit() {
    if (!note.trim()) {
      setLocal(t("noteError"));
      return;
    }
    close.mutate(
      { id: code.id, action, note: note.trim() },
      {
        onSuccess: () => {
          toast({
            tone: "success",
            title: action === "use" ? t("used") : t("writtenOff"),
            description: `${code.productName} · ${code.serial}`,
          });
          onClose();
        },
      },
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={action === "use" ? t("useTitle") : t("writeOffTitle")}
      tone={action === "writeOff" ? "danger" : undefined}
      primaryAction={{ label: action === "use" ? t("use") : t("writeOff"), loading: close.isPending, onClick: submit }}
    >
      <p className="mb-3">
        {code.productName} · <span className="font-mono">{code.serial}</span> · {t("fromOrder", { number: code.orderNumber })}
      </p>
      <TextField label={t("note")} required value={note} onChange={setNote} maxLength={300} error={local ?? err.fields.note} />
      {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
    </Modal>
  );
}
