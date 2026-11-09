"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Ban,
  CircleCheck,
  CircleX,
  ExternalLink,
  FilePlus,
  FileSpreadsheet,
  LogIn,
  Pencil,
  SearchX,
  Settings,
  ShieldCheck,
  ShieldX,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { DateChip, MultiFilter, tashkentDay } from "@/components/ui/multi-filter";
import type { PageSize } from "@/components/ui/pagination";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { api, ApiError, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatDateTime, formatQuantity } from "@/lib/format";
import { isKnownAction } from "./actions";
import { auditCsv, auditDiff, objectHref, type AuditCategory, type AuditRow, type AuditView } from "./audit-model";

export { AUDIT_ACTIONS, isKnownAction } from "./actions";

type AuditQuery = {
  view?: AuditView;
  employeeId?: number[];
  branchId?: number[];
  category?: AuditCategory[];
  entityType?: string[];
  from?: string;
  to?: string;
  q?: string;
};

/** Harakat turi belgisi (prototip ACT): ikonka va rang tokeni. */
const ACT: Record<AuditCategory, { icon: LucideIcon; className: string }> = {
  CREATE: { icon: FilePlus, className: "text-primary" },
  APPROVE: { icon: CircleCheck, className: "text-success" },
  CANCEL: { icon: CircleX, className: "text-danger" },
  CHANGE: { icon: Pencil, className: "text-text-secondary" },
  LOGIN: { icon: LogIn, className: "text-primary" },
  LOGIN_FAIL: { icon: ShieldX, className: "text-danger" },
  BLOCK: { icon: Ban, className: "text-danger" },
  PERM: { icon: ShieldCheck, className: "text-info" },
  SETTING: { icon: Settings, className: "text-warning" },
};

const OBJECT_TYPES = [
  "sales_order",
  "receipt",
  "trip",
  "warehouse_transfer",
  "zone_transfer",
  "write_off",
  "supplier_return",
  "branch_sale",
  "inventory_count",
  "opening_balance",
  "opening_finance",
  "customer_payment",
  "supplier_payment",
  "cash_op",
  "money_transfer",
  "reconciliation_act",
  "price_change",
  "advance_offset",
  "branch_payment",
  "sale",
  "cash_day_close",
  "employee",
  "counterparty",
  "product",
  "warehouse",
  "zone",
  "role",
  "branch",
  "company",
  "money_account",
  "price_type",
  "expense_item",
  "vehicle",
  "import_profile",
  "setup",
] as const;
const isObjectType = (v: string): v is (typeof OBJECT_TYPES)[number] => (OBJECT_TYPES as readonly string[]).includes(v);

const VIEWS: AuditView[] = ["ALL", "CANCEL", "FAIL", "PERM", "CTRL"];
const CATEGORIES = Object.keys(ACT) as AuditCategory[];
const EXPORT_WARN = 5000;

/** Boshqaruv → Audit jurnali (prototip AuditLog). */
export function AuditPage() {
  const t = useTranslations("audit");
  const me = useMe();
  const [view, setView] = useState<AuditView>("ALL");
  const [q, setQ] = useState("");
  const [who, setWho] = useState<number[]>([]);
  const [branches, setBranches] = useState<number[]>([]);
  const [cats, setCats] = useState<AuditCategory[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [from, setFrom] = useState<string | null>(() => tashkentDay(Date.now(), 6));
  const [to, setTo] = useState<string | null>(() => tashkentDay(Date.now()));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(50);
  const [open, setOpen] = useState<AuditRow | null>(null);
  const [bigExport, setBigExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const query: AuditQuery = {
    view,
    employeeId: who.length ? who : undefined,
    branchId: branches.length ? branches : undefined,
    category: cats.length ? cats : undefined,
    entityType: types.length ? types : undefined,
    from: from ?? undefined,
    to: to ?? undefined,
    q: q.trim() || undefined,
  };
  const audit = useQuery({
    queryKey: ["audit", query, page, pageSize],
    queryFn: () => unwrap(api.GET("/api/audit", { params: { query: { ...query, page, size: pageSize } } })),
    placeholderData: keepPreviousData,
  });
  const facets = useQuery({ queryKey: ["audit", "facets"], queryFn: () => unwrap(api.GET("/api/audit/facets")) });

  if (audit.error instanceof ApiError && audit.error.isForbidden) return <ForbiddenState description={t("forbidden")} />;

  const reset =
    <T,>(set: (v: T) => void) =>
    (v: T) => (set(v), setPage(1));
  const allBranches = !!me.data?.allBranches;
  const total = audit.data?.total ?? 0;
  const hasActive = !!(q.trim() || who.length || branches.length || cats.length || types.length);
  const clearAll = () => (setQ(""), setWho([]), setBranches([]), setCats([]), setTypes([]), setFrom(null), setTo(null), setPage(1));
  const typeLabel = (type: string) => (isObjectType(type) ? t(`ot.${type}`) : type);
  const catLabel = (c: AuditCategory) => t(`act.${c}`);

  async function runExport() {
    setBigExport(false);
    setExporting(true);
    try {
      const rows = await unwrap(api.GET("/api/audit/export", { params: { query } }));
      const csv = auditCsv(rows, {
        head: [t("time"), t("employee"), t("role"), t("branch"), t("action"), t("entity"), t("detail"), t("device")],
        time: (r) => formatDateTime(new Date(r.occurredAt)),
        cat: (r) => catLabel(r.category),
        object: (r) => r.objectLabel ?? `${typeLabel(r.entityType)}${r.entityId ? ` #${r.entityId}` : ""}`,
        allBranches: t("allBranches"),
      });
      const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "audit-jurnali.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ tone: "success", title: t("exported", { n: formatQuantity(rows.length) }) });
    } catch {
      toast({ tone: "danger", title: t("exportFailed") });
    } finally {
      setExporting(false);
    }
  }

  const columns: TableColumn<AuditRow>[] = [
    { key: "time", title: t("time"), mono: true, render: (r) => formatDateTime(new Date(r.occurredAt)) },
    {
      key: "who",
      title: t("employee"),
      render: (r) =>
        r.employeeName ? (
          <span className="flex items-center gap-2">
            <Avatar name={r.employeeName} size="sm" decorative />
            <span className="truncate">{r.employeeName}</span>
          </span>
        ) : (
          t("system")
        ),
    },
    { key: "role", title: t("role"), render: (r) => <span className="text-text-secondary">{r.roleName ?? "—"}</span> },
    { key: "branch", title: t("branch"), render: (r) => <span className="text-text-secondary">{r.branchCode ?? "—"}</span> },
    {
      key: "action",
      title: t("action"),
      render: (r) => (
        <span className="flex items-center gap-2" title={isKnownAction(r.action) ? t(`actions.${r.action}`) : r.action}>
          <Icon icon={ACT[r.category].icon} size="sm" className={ACT[r.category].className} />
          {catLabel(r.category)}
        </span>
      ),
    },
    {
      key: "object",
      title: t("entity"),
      render: (r) => {
        const label = r.objectLabel ?? `${typeLabel(r.entityType)}${r.entityId ? ` #${r.entityId}` : ""}`;
        const href = r.category === "LOGIN" || r.category === "LOGIN_FAIL" ? null : objectHref(r);
        return href ? (
          <Link href={href} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
            {label}
          </Link>
        ) : (
          label
        );
      },
    },
    {
      key: "detail",
      title: t("detail"),
      render: (r) => {
        const diff = auditDiff(r);
        return <span className="text-text-secondary">{diff.length ? diff.map((d) => d.field).join(", ") : (r.reason ?? "—")}</span>;
      },
    },
    { key: "device", title: t("device"), mono: true, render: (r) => <span className="text-text-secondary">{r.ip ?? "—"}</span> },
  ];

  const counts = new Map((audit.data?.views ?? []).map((v) => [v.view, v.count]));
  const f = facets.data;

  return (
    <>
      <div className="mb-4 flex items-start justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {audit.data ? <span className="text-body font-normal text-text-secondary tabular-nums">{formatQuantity(total)}</span> : null}
        </h1>
        <Button
          icon={FileSpreadsheet}
          loading={exporting}
          disabled={!total}
          onClick={() => (total > EXPORT_WARN ? setBigExport(true) : runExport())}
        >
          {t("export")}
        </Button>
      </div>

      <div className="mb-3">
        <Tabs
          aria-label={t("views")}
          items={VIEWS.map((v) => ({ key: v, label: t(`view.${v}`), count: counts.get(v) }))}
          value={view}
          onChange={(k) => (setView(k as AuditView), setPage(1))}
        />
      </div>

      {audit.error ? (
        <ErrorState onRetry={() => audit.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          density="compact"
          columns={columns}
          rows={audit.data?.items ?? []}
          rowKey={(r) => String(r.id)}
          loading={audit.isPending}
          onRowClick={setOpen}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-72">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={q}
                  onChange={reset(setQ)}
                  placeholder={t("searchPh")}
                  className="[&>label]:sr-only"
                />
              </div>
              <MultiFilter
                label={t("employee")}
                searchable
                options={(f?.employees ?? []).map((o) => ({ value: Number(o.value), label: o.label, count: o.count }))}
                selected={who}
                onChange={reset(setWho)}
              />
              {allBranches ? (
                <MultiFilter
                  label={t("branch")}
                  options={(f?.branches ?? []).map((o) => ({
                    value: Number(o.value),
                    label: o.value === "0" ? t("allBranches") : o.label,
                    count: o.count,
                  }))}
                  selected={branches}
                  onChange={reset(setBranches)}
                />
              ) : null}
              <MultiFilter
                label={t("action")}
                options={CATEGORIES.map((c) => ({
                  value: c,
                  label: catLabel(c),
                  count: f?.categories.find((o) => o.value === c)?.count ?? 0,
                }))}
                selected={cats}
                onChange={reset(setCats)}
              />
              <MultiFilter
                label={t("entityType")}
                searchable
                options={(f?.entityTypes ?? []).map((o) => ({ value: o.value, label: typeLabel(o.value), count: o.count }))}
                selected={types}
                onChange={reset(setTypes)}
              />
              <DateChip
                label={t("period")}
                from={from}
                to={to}
                invalid={t("dateInvalid")}
                onChange={(a, b) => (setFrom(a), setTo(b), setPage(1))}
              />
            </div>
          }
          emptyState={
            <EmptyState
              icon={SearchX}
              title={t("emptyTitle")}
              description={t("emptyDescription")}
              action={
                hasActive || from || to ? (
                  <Button variant="secondary" onClick={clearAll}>
                    {t("clear")}
                  </Button>
                ) : undefined
              }
            />
          }
          pagination={{
            page,
            pageSize,
            total,
            onPageChange: setPage,
            onPageSizeChange: (s) => (setPageSize(s), setPage(1)),
          }}
        />
      )}

      {open ? <AuditDrawer row={open} onClose={() => setOpen(null)} typeLabel={typeLabel} catLabel={catLabel} /> : null}

      <Modal
        open={bigExport}
        onClose={() => setBigExport(false)}
        title={t("bigT")}
        primaryAction={{ label: t("export"), onClick: () => void runExport() }}
      >
        <p className="text-body">{t("big", { n: formatQuantity(total), max: formatQuantity(EXPORT_WARN) })}</p>
      </Modal>
    </>
  );
}

function AuditDrawer({
  row,
  onClose,
  typeLabel,
  catLabel,
}: {
  row: AuditRow;
  onClose: () => void;
  typeLabel: (t: string) => string;
  catLabel: (c: AuditCategory) => string;
}) {
  const t = useTranslations("audit");
  const diff = auditDiff(row);
  const href = row.category === "LOGIN" || row.category === "LOGIN_FAIL" ? null : objectHref(row);
  const object = row.objectLabel ?? `${typeLabel(row.entityType)}${row.entityId ? ` #${row.entityId}` : ""}`;
  const info: [string, string][] = [
    [t("employee"), row.employeeName ?? t("system")],
    [t("role"), row.roleName ?? "—"],
    [t("branch"), row.branchName ?? t("allBranches")],
    [t("action"), catLabel(row.category)],
    [t("actionCode"), isKnownAction(row.action) ? t(`actions.${row.action}`) : row.action],
    [t("entity"), object],
    [t("entityType"), typeLabel(row.entityType)],
    [t("reason"), row.reason ?? "—"],
    [t("device"), row.ip ?? "—"],
  ];
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("record")}
      title={`${catLabel(row.category)} · ${object}`}
      subtitle={formatDateTime(new Date(row.occurredAt))}
      actions={
        href ? (
          <Link
            href={href}
            className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-4 text-body hover:bg-background"
          >
            <Icon icon={ExternalLink} size="sm" />
            {t("openObject")}
          </Link>
        ) : undefined
      }
    >
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
        {info.map(([label, value]) => (
          <div key={label} className="flex min-w-0 flex-col gap-[2px]">
            <dt className="text-caption text-text-secondary">{label}</dt>
            <dd className="text-body break-words">{value}</dd>
          </div>
        ))}
      </dl>
      <h3 className="mt-6 mb-2 text-subtitle">{t("diffT")}</h3>
      {diff.length ? (
        <table className="w-full text-table">
          <caption className="sr-only">{t("diffT")}</caption>
          <thead className="bg-table-header text-caption text-text-secondary">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("field")}
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("before")}
              </th>
              <th scope="col" className="px-3 py-2 text-left font-medium">
                {t("after")}
              </th>
            </tr>
          </thead>
          <tbody>
            {diff.map((d) => (
              <tr key={d.field} className="border-t border-border">
                <td className="px-3 py-2 font-medium">{d.field}</td>
                <td className={cn("px-3 py-2 break-all text-text-secondary")}>{d.before}</td>
                <td className="px-3 py-2 break-all">{d.after}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-body text-text-secondary">{t("noDiff")}</p>
      )}
    </Drawer>
  );
}
