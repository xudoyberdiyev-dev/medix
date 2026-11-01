"use client";

import { Ban, CircleCheck, CircleX, Clock, FilePen, Plus, Tags } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { useMe } from "@/features/auth/session";
import { usePriceTypes } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { formatDate, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  PRICE_SETTERS,
  STATUS_LABELS,
  usePriceChanges,
  usePrices,
  type DraftLine,
  type PriceChangeStatus,
  type PriceChangeSummary,
  type PriceRow,
} from "./api";
import { PriceChangeDrawer } from "./price-change-drawer";

export function StatusBadge({ status }: { status: PriceChangeStatus }) {
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    PENDING_APPROVAL: { tone: "warning", icon: Clock },
    APPROVED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "danger", icon: CircleX },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PricesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = params.get("tab") === "documents" ? "documents" : "prices";
  const me = useMe();
  const branches = useBranchList();
  const selected = useBranchStore((s) => s.branchId);
  const active = (branches.data ?? []).filter((b) => b.active);
  const [branchOverride, setBranchOverride] = useState<number | null>(null);
  const branchId = branchOverride ?? (me.data && !me.data.allBranches ? (me.data.branchId ?? null) : (selected ?? active[0]?.id ?? null));
  const canSet = PRICE_SETTERS.includes(me.data?.role.code ?? "");
  const [editor, setEditor] = useState<{ id: number | null; preset?: DraftLine[] } | null>(null);

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">Narxlar</h1>
        <div className="flex items-center gap-3">
          {me.data?.allBranches ? (
            <div className="w-56">
              <Select
                label="Filial"
                size="sm"
                value={branchId ? String(branchId) : null}
                onChange={(v) => setBranchOverride(v ? Number(v) : null)}
                className="[&>span:first-child]:sr-only"
                options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
              />
            </div>
          ) : null}
          {canSet ? (
            <Button icon={Plus} onClick={() => setEditor({ id: null })}>
              Narx oʻrnatish
            </Button>
          ) : null}
        </div>
      </div>
      <div className="mb-4">
        <Tabs
          aria-label="Narxlar"
          items={[
            { key: "prices", label: "Amaldagi narxlar" },
            { key: "documents", label: "Narx oʻzgarishlari (NO)" },
          ]}
          value={tab}
          onChange={(k) => router.replace(k === "documents" ? `${pathname}?tab=documents` : pathname, { scroll: false })}
        />
      </div>
      {tab === "prices" ? (
        <PricesTab branchId={branchId} canSet={canSet} onSetPrices={(lines) => setEditor({ id: null, preset: lines })} />
      ) : (
        <DocumentsTab branchId={branchId} onOpen={(id) => setEditor({ id })} />
      )}
      {editor && branchId ? (
        <PriceChangeDrawer
          id={editor.id}
          branchId={branchId}
          preset={editor.preset}
          canSet={canSet}
          onClose={() => setEditor(null)}
          onCreated={(id) => setEditor({ id })}
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
  const types = usePriceTypes();
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<25 | 50 | 100>(50);
  const [selection, setSelection] = useState<string[]>([]);
  const [targetType, setTargetType] = useState<string | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const prices = usePrices(branchId, q, page, size);
  const rows = prices.data?.items ?? [];
  const typeList = types.data ?? [];

  const columns: TableColumn<PriceRow>[] = [
    { key: "code", title: "Kod", mono: true, width: 110 },
    {
      key: "name",
      title: "Mahsulot",
      render: (p) => (
        <span className="flex flex-col">
          <span>{p.name}</span>
          {p.manufacturer ? <span className="text-caption text-text-secondary">{p.manufacturer}</span> : null}
        </span>
      ),
    },
    ...typeList.map((t) => ({
      key: `t${t.id}`,
      title: t.name,
      align: "right" as const,
      render: (p: PriceRow) =>
        p.prices[String(t.id)] ? formatMoney(p.prices[String(t.id)]) : <span className="text-text-disabled">—</span>,
    })),
  ];

  if (prices.error) return <ErrorState onRetry={() => prices.refetch()} />;
  return (
    <Table
      caption="Amaldagi narxlar"
      columns={columns}
      rows={rows}
      rowKey={(p) => String(p.productId)}
      loading={prices.isPending}
      selectable={canSet}
      selectedKeys={selection}
      onSelectionChange={setSelection}
      bulkActions={
        <div className="flex items-center gap-3">
          <span>{selection.length} ta tanlandi</span>
          <div className="w-56">
            <Select
              label="Narx turi"
              size="sm"
              value={targetType}
              onChange={setTargetType}
              placeholder="Narx turi"
              className="[&>span:first-child]:sr-only"
              options={typeList.map((t) => ({ value: String(t.id), label: t.name }))}
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
            Narx oʻrnatish
          </Button>
        </div>
      }
      toolbar={
        <div className="w-80">
          <TextField
            label="Qidirish"
            variant="search"
            size="sm"
            value={search}
            onChange={(v) => {
              setSearch(v);
              clearTimeout(debounce.current);
              debounce.current = setTimeout(() => (setQ(v), setPage(1)), 300);
            }}
            placeholder="Mahsulot nomi yoki kodi"
            className="[&>label]:sr-only"
          />
        </div>
      }
      emptyState={
        q ? (
          <NoResultsState onClearFilters={() => (setSearch(""), setQ(""))} />
        ) : (
          <EmptyState icon={Tags} title="Mahsulot yoʻq" description="Avval Mahsulotlar boʻlimida katalogni toʻldiring." />
        )
      }
      pagination={
        prices.data && prices.data.total > 0
          ? { page, pageSize: size, total: prices.data.total, onPageChange: setPage, onPageSizeChange: (s) => (setSize(s), setPage(1)) }
          : undefined
      }
    />
  );
}

function DocumentsTab({ branchId, onOpen }: { branchId: number | null; onOpen: (id: number) => void }) {
  const [status, setStatus] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const docs = usePriceChanges(branchId, (status as PriceChangeStatus | null) ?? null, page);
  const columns: TableColumn<PriceChangeSummary>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "effectiveFrom", title: "Kuchga kirish", render: (d) => formatDate(new Date(`${d.effectiveFrom}T00:00:00+05:00`)) },
    { key: "lines", title: "Qatorlar", align: "right" },
    { key: "createdBy", title: "Kiritdi" },
    { key: "status", title: "Holat", render: (d) => <StatusBadge status={d.status} /> },
  ];
  if (docs.error) return <ErrorState onRetry={() => docs.refetch()} />;
  return (
    <Table
      caption="NO hujjatlari"
      columns={columns}
      rows={docs.data?.items ?? []}
      rowKey={(d) => String(d.id)}
      loading={docs.isPending}
      onRowClick={(d) => onOpen(d.id)}
      toolbar={
        <div className="w-56">
          <Select
            label="Holat"
            size="sm"
            value={status}
            onChange={(v) => (setStatus(v), setPage(1))}
            placeholder="Barcha holatlar"
            className="[&>span:first-child]:sr-only"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
          />
        </div>
      }
      emptyState={
        status ? (
          <NoResultsState onClearFilters={() => setStatus(null)} />
        ) : (
          <EmptyState
            icon={FilePen}
            title="Hali narx oʻzgarishi yoʻq"
            description="Har narx saqlash NO hujjati boʻladi va tarixi yoziladi."
          />
        )
      }
      pagination={
        docs.data && docs.data.total > 50
          ? { page, pageSize: 50, total: docs.data.total, onPageChange: setPage, onPageSizeChange: () => undefined, pageSizeOptions: [50] }
          : undefined
      }
    />
  );
}
