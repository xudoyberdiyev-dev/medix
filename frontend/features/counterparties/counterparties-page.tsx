"use client";

import { Ban, CircleAlert, CircleCheck, CirclePause, Clock, Columns3, FileDown, Plus, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/selection-controls";
import { SavedViews } from "@/components/ui/saved-views";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { useMe } from "@/features/auth/session";
import { useDictionary } from "@/features/dictionaries/api";
import { formatQuantity } from "@/lib/format";
import {
  canEditCard,
  formatIsoDate,
  licenseState,
  todayTashkent,
  useCounterparties,
  type CounterpartyQuery,
  type CounterpartyRole,
  type CounterpartyRow,
  type CounterpartyStatus,
} from "./api";
import { SORT_COLUMNS, counterpartyExportQuery, parseCounterpartyQuery, serializeCounterpartyQuery, sortColumn } from "./url-state";
import { searchMatchLabel } from "@/lib/search";
import { CounterpartyDrawer } from "./counterparty-drawer";

const STATUS_VALUES = ["ACTIVE", "BLOCKED", "INACTIVE", "ALL"] as const;

export function StatusBadge({ blocked, active }: { blocked: boolean; active: boolean }) {
  const t = useTranslations("counterparties.status");
  if (blocked)
    return (
      <Badge tone="danger" icon={Ban}>
        {t("BLOCKED")}
      </Badge>
    );
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      {t("ACTIVE")}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      {t("INACTIVE")}
    </Badge>
  );
}

export function LicenseBadge({ validUntil }: { validUntil?: string | null }) {
  const t = useTranslations("counterparties.license");
  const state = licenseState(validUntil, todayTashkent());
  if (state === "none")
    return (
      <Badge tone="warning" icon={CircleAlert}>
        {t("none")}
      </Badge>
    );
  if (state === "expired")
    return (
      <Badge tone="danger" icon={CircleAlert}>
        {t("expired", { date: formatIsoDate(validUntil) })}
      </Badge>
    );
  if (state === "expiring")
    return (
      <Badge tone="warning" icon={Clock}>
        {t("until", { date: formatIsoDate(validUntil) })}
      </Badge>
    );
  return (
    <Badge tone="success" icon={CircleCheck}>
      {t("until", { date: formatIsoDate(validUntil) })}
    </Badge>
  );
}

const ALWAYS = ["tin", "name"];

function useHiddenColumns(storageKey: string) {
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- brauzer xotirasidan bir marta oʻqiladi
      if (raw) setHidden(JSON.parse(raw) as string[]);
    } catch {
      /* xotira yopiq — standart ustunlar */
    }
  }, [storageKey]);
  const update = (next: string[]) => {
    setHidden(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* saqlanmasa ham ishlaydi */
    }
  };
  return [hidden, update] as const;
}

export function CounterpartiesPage({ role }: { role: CounterpartyRole }) {
  const t = useTranslations("counterparties.list");
  const ts = useTranslations("counterparties.status");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = parseCounterpartyQuery(new URLSearchParams(params.toString()), role);
  const me = useMe();
  const canEdit = canEditCard(me.data?.permissions, role === "CUSTOMER", role === "SUPPLIER");
  const list = useCounterparties(f);
  const regions = useDictionary("REGION");
  const [search, setSearch] = useState(f.q);
  const [open, setOpen] = useState<number | "new" | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isCustomer = role === "CUSTOMER";
  const title = isCustomer ? t("customers") : t("suppliers");
  const [hidden, setHidden] = useHiddenColumns(`medix-counterparties-${role}-columns`);
  const [columnsOpen, setColumnsOpen] = useState(false);

  const apply = (patch: Partial<CounterpartyQuery>) => {
    const qs = serializeCounterpartyQuery({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const allColumns: TableColumn<CounterpartyRow>[] = [
    { key: "tin", title: t("col.tin"), mono: true, width: 140, sortable: true },
    {
      key: "name",
      title: t("col.name"),
      sortable: true,
      render: (c) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            {c.name}
            {c.customer && c.supplier ? <Badge tone="info">{isCustomer ? t("alsoSupplier") : t("alsoCustomer")}</Badge> : null}
          </span>
          {c.legalName ? <span className="text-caption text-text-secondary">{c.legalName}</span> : null}
          {c.match ? <span className="text-caption text-text-secondary">{searchMatchLabel(c.match)}</span> : null}
        </span>
      ),
    },
    { key: "region", title: t("col.region"), sortable: true },
    { key: "phone", title: t("col.phone") },
    ...(isCustomer
      ? [
          {
            key: "license",
            title: t("col.license"),
            sortable: true,
            render: (c: CounterpartyRow) => <LicenseBadge validUntil={c.licenseValidUntil} />,
          },
        ]
      : []),
    { key: "status", title: t("col.status"), render: (c: CounterpartyRow) => <StatusBadge blocked={c.blocked} active={c.active} /> },
  ];
  const columns = allColumns.filter((c) => ALWAYS.includes(c.key) || !hidden.includes(c.key));

  const filtered = Boolean(f.q) || f.status !== "ACTIVE" || f.regionId !== null;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-page-title">{title}</h1>
          {list.data ? <span className="text-text-secondary">{t("count", { count: formatQuantity(list.data.total) })}</span> : null}
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/counterparties/export?${counterpartyExportQuery(f)}`}
            download
            className="inline-flex h-control-md items-center gap-2 rounded-control border border-border bg-surface px-4 font-medium hover:bg-background"
          >
            <FileDown size={16} strokeWidth={1.5} aria-hidden />
            {t("export")}
          </a>
          {canEdit ? (
            <Button icon={Plus} onClick={() => setOpen("new")}>
              {isCustomer ? t("addCustomer") : t("addSupplier")}
            </Button>
          ) : null}
        </div>
      </div>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={title}
          columns={columns}
          rows={list.data?.items ?? []}
          rowKey={(c) => String(c.id)}
          loading={list.isPending}
          activeKey={typeof open === "number" ? String(open) : undefined}
          onRowClick={(c) => setOpen(c.id)}
          sort={{ key: sortColumn(f.sort), dir: f.desc ? "desc" : "asc" }}
          onSortChange={(s) => apply({ sort: SORT_COLUMNS[s.key] ?? "NAME", desc: s.dir === "desc" })}
          toolbar={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={search}
                  onChange={(v) => {
                    setSearch(v);
                    clearTimeout(debounce.current);
                    debounce.current = setTimeout(() => apply({ q: v }), 300);
                  }}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              <div className="w-56">
                <Select
                  label={t("region")}
                  size="sm"
                  searchable
                  value={f.regionId ? String(f.regionId) : null}
                  onChange={(v) => apply({ regionId: v ? Number(v) : null })}
                  placeholder={t("allRegions")}
                  className="[&>span:first-child]:sr-only"
                  options={(regions.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
                />
              </div>
              <div className="w-40">
                <Select
                  label={t("status")}
                  size="sm"
                  value={f.status}
                  onChange={(v) => apply({ status: (v as CounterpartyStatus | null) ?? "ACTIVE" })}
                  className="[&>span:first-child]:sr-only"
                  options={STATUS_VALUES.map((value) => ({ value, label: ts(value) }))}
                />
              </div>
              <div className="ml-auto">
                <SavedViews
                  storageKey={`medix-counterparties-${role}-views`}
                  query={params.toString()}
                  hidden={hidden}
                  onApply={(v) => {
                    setSearch(parseCounterpartyQuery(new URLSearchParams(v.query), role).q);
                    setHidden(v.hidden);
                    router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
                  }}
                />
              </div>
              <div className="relative">
                <Button variant="secondary" size="sm" icon={Columns3} onClick={() => setColumnsOpen((o) => !o)} aria-expanded={columnsOpen}>
                  {t("columns")}
                </Button>
                {columnsOpen ? (
                  <div className="absolute right-0 z-30 mt-1 flex w-60 flex-col gap-2 rounded-control border border-border bg-surface p-3 shadow-overlay">
                    {allColumns
                      .filter((c) => !ALWAYS.includes(c.key))
                      .map((c) => (
                        <Checkbox
                          key={c.key}
                          label={c.title}
                          checked={!hidden.includes(c.key)}
                          onChange={(on) => setHidden(on ? hidden.filter((h) => h !== c.key) : [...hidden, c.key])}
                        />
                      ))}
                  </div>
                ) : null}
              </div>
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setSearch(""), apply({ q: "", status: "ACTIVE", regionId: null }))} />
            ) : (
              <EmptyState icon={Users} title={isCustomer ? t("emptyCustomers") : t("emptySuppliers")} description={t("emptyDescription")} />
            )
          }
          pagination={
            list.data && list.data.total > 0
              ? {
                  page: f.page,
                  pageSize: f.size,
                  total: list.data.total,
                  onPageChange: (page) => apply({ page }),
                  onPageSizeChange: (size) => apply({ size }),
                }
              : undefined
          }
        />
      )}
      {open !== null ? (
        <CounterpartyDrawer
          counterpartyId={open === "new" ? null : open}
          defaultRole={role}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onCreated={setOpen}
        />
      ) : null}
    </>
  );
}
