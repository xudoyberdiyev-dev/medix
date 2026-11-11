"use client";

import { Ban, CircleCheck, CircleX, Clock, FileDown, FilePen, Plus, Tag, Tags } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayField } from "@/components/ui/day-field";
import { SavedViews } from "@/components/ui/saved-views";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { usePriceTypes } from "@/features/counterparties/api";
import { useDictionary } from "@/features/dictionaries/api";
import { useBranchList } from "@/features/organization/api";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { PRICE_CREATE, usePrices, type DraftLine, type PriceChangeStatus, type PriceRow } from "./api";
import { PriceChangesTab } from "./price-changes-tab";
import { PriceTypesTab } from "./price-types-tab";
import { CLIENT_TERMS } from "./attach-customers-dialog";
import { PriceChangeDrawer } from "./price-change-drawer";
import { parsePriceFilters, priceExportQuery, priceSortFromKey, priceSortKey, serializePriceFilters, type PriceFilters } from "./url-state";

export function StatusBadge({ status }: { status: PriceChangeStatus }) {
  const t = useTranslations("prices");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    PENDING_APPROVAL: { tone: "warning", icon: Clock },
    APPROVED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "danger", icon: CircleX },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`status.${status}`)}
    </Badge>
  );
}

export function PricesPage() {
  const t = useTranslations("prices.page");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const rawTab = params.get("tab");
  const tab = rawTab === "documents" || rawTab === "prices" ? rawTab : "types";
  const me = useMe();
  const branches = useBranchList();
  const selected = useBranchStore((s) => s.branchId);
  const active = (branches.data ?? []).filter((b) => b.active);
  const [branchOverride, setBranchOverride] = useState<number | null>(null);
  const branchId = branchOverride ?? (me.data && !me.data.allBranches ? (me.data.branchId ?? null) : (selected ?? active[0]?.id ?? null));
  const canSet = can(me.data, PRICE_CREATE);
  const canCreateType = can(me.data, "lookups.ptypes") && branchId != null;
  const [creatingType, setCreatingType] = useState(false);
  const types = useQuery({
    queryKey: ["price-types", "overview", branchId],
    queryFn: () => unwrap(api.GET("/api/price-types/overview", { params: { query: { branchId: branchId ?? 0 } } })),
    enabled: branchId != null,
  });
  // «Narx oʻrnatish» sahifasidan «Kirim boʻyicha»: ?new=receipt — yangi NO kirim rejimida ochiladi
  const [editor, setEditor] = useState<{ id: number | null; preset?: DraftLine[]; mode?: "RECEIPT" } | null>(() =>
    params.get("new") === "receipt" ? { id: null, mode: "RECEIPT" } : null,
  );
  // Bildirishnomadan / qidiruvdan oʻtish: ?tab=documents&open=<id> — NO hujjati sahifasiga
  const openId = Number(params.get("open"));
  useEffect(() => {
    if (Number.isInteger(openId) && openId > 0) router.replace(`/prices/changes/${openId}`);
  }, [openId, router]);
  const openDoc = (id: number) => router.push(`/prices/changes/${id}`);
  const openSet = (priceTypeId?: number) =>
    router.push(
      `/prices/set?${new URLSearchParams({ ...(branchId ? { branch: String(branchId) } : {}), ...(priceTypeId ? { type: String(priceTypeId) } : {}) })}`,
    );

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="flex items-baseline gap-2 text-page-title">
          {t("title")}
          {types.data ? <span className="tabular text-body text-text-secondary">{formatQuantity(types.data.length)}</span> : null}
        </h1>
        <div className="flex items-center gap-2">
          {canSet ? (
            <Button variant={canCreateType ? "secondary" : "primary"} icon={Tag} onClick={() => openSet()}>
              {t("set")}
            </Button>
          ) : null}
          {canCreateType ? (
            <Button icon={Plus} onClick={() => (tab !== "types" && router.replace(pathname, { scroll: false }), setCreatingType(true))}>
              {t("newType")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-border">
        <div className="-mb-px min-w-0">
          <Tabs
            aria-label={t("title")}
            items={[
              { key: "types", label: t("tabTypes") },
              { key: "documents", label: t("tabDocuments") },
              { key: "prices", label: t("tabCurrent") },
            ]}
            value={tab}
            onChange={(k) => router.replace(k === "types" ? pathname : `${pathname}?tab=${k}`, { scroll: false })}
          />
        </div>
        {me.data?.allBranches ? (
          <div className="mb-1.5 w-56">
            <Select
              label={t("branch")}
              size="sm"
              value={branchId ? String(branchId) : null}
              onChange={(v) => setBranchOverride(v ? Number(v) : null)}
              className="[&>span:first-child]:sr-only"
              options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
            />
          </div>
        ) : null}
      </div>
      {tab === "types" ? (
        <PriceTypesTab
          branchId={branchId}
          canSet={canSet}
          canEdit={can(me.data, "lookups.ptypes")}
          canAttach={can(me.data, CLIENT_TERMS)}
          branchName={active.find((b) => b.id === branchId)?.name ?? ""}
          onSetPrices={(id) => openSet(id)}
          creating={creatingType}
          onCreatingChange={setCreatingType}
        />
      ) : tab === "prices" ? (
        <PricesTab branchId={branchId} canSet={canSet} onSetPrices={(lines) => setEditor({ id: null, preset: lines })} />
      ) : (
        <PriceChangesTab branchId={branchId} onOpen={openDoc} />
      )}
      {editor && branchId ? (
        <PriceChangeDrawer
          id={editor.id}
          branchId={branchId}
          preset={editor.preset}
          initialMode={editor.mode}
          canSet={canSet}
          onClose={() => setEditor(null)}
          onCreated={(id) => (setEditor(null), openDoc(id))}
        />
      ) : null}
    </>
  );
}

function PricesTab({
  branchId,
  canSet,
  onSetPrices,
}: {
  branchId: number | null;
  canSet: boolean;
  onSetPrices: (lines: DraftLine[]) => void;
}) {
  const t = useTranslations("prices.current");
  const types = usePriceTypes();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = parsePriceFilters(new URLSearchParams(params.toString()));
  const manufacturers = useDictionary("MANUFACTURER");
  const [search, setSearch] = useState(f.q);
  const apply = (patch: Partial<PriceFilters>) => {
    const qs = serializePriceFilters({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const [selection, setSelection] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prices = usePrices(branchId, f);
  const rows = prices.data?.items ?? [];
  const typeList = types.data ?? [];

  const columns: TableColumn<PriceRow>[] = [
    { key: "code", title: t("code"), mono: true, width: 110, sortable: true },
    {
      key: "name",
      title: t("product"),
      sortable: true,
      render: (p) => (
        <span className="flex flex-col">
          <span>{p.name}</span>
          {p.manufacturer ? <span className="text-caption text-text-secondary">{p.manufacturer}</span> : null}
        </span>
      ),
    },
    ...typeList.map((pt) => ({
      key: `t${pt.id}`,
      title: pt.name,
      align: "right" as const,
      render: (p: PriceRow) =>
        p.prices[String(pt.id)] ? formatMoney(p.prices[String(pt.id)]) : <span className="text-text-disabled">—</span>,
    })),
  ];

  if (prices.error) return <ErrorState error={prices.error} onRetry={() => prices.refetch()} />;
  return (
    <Table
      caption={t("caption")}
      columns={columns}
      rows={rows}
      rowKey={(p) => String(p.productId)}
      loading={prices.isPending}
      selectable={canSet}
      selectedKeys={selection}
      onSelectionChange={setSelection}
      bulkActions={
        <div className="flex items-center gap-3">
          <span>{t("selected", { count: selection.length })}</span>
          <div className="w-56">
            <Select
              label={t("priceType")}
              size="sm"
              value={targetType}
              onChange={setTargetType}
              placeholder={t("priceType")}
              className="[&>span:first-child]:sr-only"
              options={typeList.map((pt) => ({ value: String(pt.id), label: pt.name }))}
            />
          </div>
          <Button
            size="sm"
            icon={Tags}
            disabled={!targetType}
            onClick={() => {
              const type = Number(targetType);
              const chosen = rows.filter((r) => selection.includes(String(r.productId)));
              onSetPrices(
                chosen.map((r) => ({
                  productId: r.productId,
                  productCode: r.code,
                  productName: r.name,
                  priceTypeId: type,
                  oldPrice: r.prices[String(type)] ?? null,
                  newPrice: r.prices[String(type)] ?? "",
                })),
              );
              setSelection([]);
            }}
          >
            {t("set")}
          </Button>
        </div>
      }
      sort={{ key: priceSortKey(f.sort), dir: f.desc ? "desc" : "asc" }}
      onSortChange={(s) => apply({ sort: priceSortFromKey(s.key), desc: s.dir === "desc" })}
      toolbar={
        <div className="flex flex-wrap items-end gap-3">
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
              label={t("manufacturer")}
              size="sm"
              searchable
              value={f.manufacturerId ? String(f.manufacturerId) : null}
              onChange={(v) => apply({ manufacturerId: v ? Number(v) : null })}
              placeholder={t("allManufacturers")}
              className="[&>span:first-child]:sr-only"
              options={(manufacturers.data ?? []).map((m) => ({ value: String(m.id), label: m.name }))}
            />
          </div>
          <DayField label={t("at")} value={f.at} invalid={t("dateInvalid")} onApply={(at) => apply({ at })} />
          <div className="ml-auto flex items-center gap-2">
            <SavedViews
              storageKey="medix-prices-views"
              query={params.toString()}
              hidden={[]}
              onApply={(v) => {
                setSearch(parsePriceFilters(new URLSearchParams(v.query)).q);
                router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
              }}
            />
            {branchId ? (
              <a
                href={`/api/prices/export?${priceExportQuery(branchId, f)}`}
                download
                className="inline-flex h-control-sm items-center gap-2 rounded-control border border-border bg-surface px-3 font-medium hover:bg-background"
              >
                <FileDown size={16} strokeWidth={1.5} aria-hidden />
                {t("export")}
              </a>
            ) : null}
          </div>
        </div>
      }
      emptyState={
        f.q || f.manufacturerId || f.at ? (
          <NoResultsState onClearFilters={() => (setSearch(""), apply({ q: "", manufacturerId: null, at: null }))} />
        ) : (
          <EmptyState icon={Tags} title={t("emptyTitle")} description={t("emptyDescription")} />
        )
      }
      pagination={
        prices.data && prices.data.total > 0
          ? {
              page: f.page,
              pageSize: f.size,
              total: prices.data.total,
              onPageChange: (page) => apply({ page }),
              onPageSizeChange: (size) => apply({ size }),
            }
          : undefined
      }
    />
  );
}
