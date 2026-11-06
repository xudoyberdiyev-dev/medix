"use client";

import { Ban, CircleCheck, CirclePause, CircleAlert, Clock, Plus, Users } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { searchMatchLabel } from "@/lib/search";
import { CounterpartyDrawer } from "./counterparty-drawer";

const STATUS_OPTIONS = [
  { value: "ACTIVE", label: "Faol" },
  { value: "BLOCKED", label: "Bloklangan" },
  { value: "INACTIVE", label: "Nofaol" },
  { value: "ALL", label: "Hammasi" },
];

export function StatusBadge({ blocked, active }: { blocked: boolean; active: boolean }) {
  if (blocked)
    return (
      <Badge tone="danger" icon={Ban}>
        Bloklangan
      </Badge>
    );
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      Faol
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      Nofaol
    </Badge>
  );
}

export function LicenseBadge({ validUntil }: { validUntil?: string | null }) {
  const state = licenseState(validUntil, todayTashkent());
  if (state === "none")
    return (
      <Badge tone="warning" icon={CircleAlert}>
        Yoʻq
      </Badge>
    );
  if (state === "expired")
    return (
      <Badge tone="danger" icon={CircleAlert}>
        Oʻtgan · {formatIsoDate(validUntil)}
      </Badge>
    );
  if (state === "expiring")
    return (
      <Badge tone="warning" icon={Clock}>
        {formatIsoDate(validUntil)} gacha
      </Badge>
    );
  return (
    <Badge tone="success" icon={CircleCheck}>
      {formatIsoDate(validUntil)} gacha
    </Badge>
  );
}

function parse(params: URLSearchParams, role: CounterpartyRole): CounterpartyQuery {
  const status = params.get("status");
  const size = Number(params.get("size"));
  const region = Number(params.get("region"));
  const page = Number(params.get("page"));
  return {
    q: params.get("q") ?? "",
    role,
    status: status === "BLOCKED" || status === "INACTIVE" || status === "ALL" ? status : "ACTIVE",
    regionId: Number.isInteger(region) && region > 0 ? region : null,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    size: size === 25 || size === 100 ? size : 50,
  };
}

function serialize(f: CounterpartyQuery): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set("q", f.q.trim());
  if (f.status !== "ACTIVE") p.set("status", f.status);
  if (f.regionId) p.set("region", String(f.regionId));
  if (f.page > 1) p.set("page", String(f.page));
  if (f.size !== 50) p.set("size", String(f.size));
  return p.toString();
}

export function CounterpartiesPage({ role }: { role: CounterpartyRole }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const f = parse(new URLSearchParams(params.toString()), role);
  const me = useMe();
  const canEdit = canEditCard(me.data?.permissions, role === "CUSTOMER", role === "SUPPLIER");
  const list = useCounterparties(f);
  const regions = useDictionary("REGION");
  const [search, setSearch] = useState(f.q);
  const [open, setOpen] = useState<number | "new" | null>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isCustomer = role === "CUSTOMER";
  const title = isCustomer ? "Mijozlar" : "Yetkazib beruvchilar";

  const apply = (patch: Partial<CounterpartyQuery>) => {
    const qs = serialize({ ...f, page: 1, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const columns: TableColumn<CounterpartyRow>[] = [
    { key: "tin", title: "STIR", mono: true, width: 140 },
    {
      key: "name",
      title: "Nomi",
      render: (c) => (
        <span className="flex flex-col">
          <span className="flex items-center gap-2">
            {c.name}
            {c.customer && c.supplier ? <Badge tone="info">{isCustomer ? "YB ham" : "Mijoz ham"}</Badge> : null}
          </span>
          {c.legalName ? <span className="text-caption text-text-secondary">{c.legalName}</span> : null}
          {c.match ? <span className="text-caption text-text-secondary">{searchMatchLabel(c.match)}</span> : null}
        </span>
      ),
    },
    { key: "region", title: "Hudud" },
    { key: "phone", title: "Telefon" },
    ...(isCustomer
      ? [{ key: "license", title: "Litsenziya", render: (c: CounterpartyRow) => <LicenseBadge validUntil={c.licenseValidUntil} /> }]
      : []),
    { key: "status", title: "Holat", render: (c: CounterpartyRow) => <StatusBadge blocked={c.blocked} active={c.active} /> },
  ];

  const filtered = Boolean(f.q) || f.status !== "ACTIVE" || f.regionId !== null;
  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-baseline gap-3">
          <h1 className="text-page-title">{title}</h1>
          {list.data ? <span className="text-text-secondary">{formatQuantity(list.data.total)} ta</span> : null}
        </div>
        {canEdit ? (
          <Button icon={Plus} onClick={() => setOpen("new")}>
            {isCustomer ? "Mijoz qoʻshish" : "Yetkazib beruvchi qoʻshish"}
          </Button>
        ) : null}
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
                    debounce.current = setTimeout(() => apply({ q: v }), 300);
                  }}
                  placeholder="Nom, STIR, telefon (lotin yoki kirill)"
                  className="[&>label]:sr-only"
                />
              </div>
              <div className="w-56">
                <Select
                  label="Hudud"
                  size="sm"
                  searchable
                  value={f.regionId ? String(f.regionId) : null}
                  onChange={(v) => apply({ regionId: v ? Number(v) : null })}
                  placeholder="Barcha hududlar"
                  className="[&>span:first-child]:sr-only"
                  options={(regions.data ?? []).map((r) => ({ value: String(r.id), label: r.name }))}
                />
              </div>
              <div className="w-40">
                <Select
                  label="Holat"
                  size="sm"
                  value={f.status}
                  onChange={(v) => apply({ status: (v as CounterpartyStatus | null) ?? "ACTIVE" })}
                  className="[&>span:first-child]:sr-only"
                  options={STATUS_OPTIONS}
                />
              </div>
              <div className="ml-auto">
                <SavedViews
                  storageKey={`medix-counterparties-${role}-views`}
                  query={params.toString()}
                  hidden={[]}
                  onApply={(v) => {
                    setSearch(parse(new URLSearchParams(v.query), role).q);
                    router.replace(v.query ? `${pathname}?${v.query}` : pathname, { scroll: false });
                  }}
                />
              </div>
            </div>
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => (setSearch(""), apply({ q: "", status: "ACTIVE", regionId: null }))} />
            ) : (
              <EmptyState
                icon={Users}
                title={isCustomer ? "Hali mijoz qoʻshilmagan" : "Hali yetkazib beruvchi qoʻshilmagan"}
                description="Bitta STIR — bitta karta: mijoz yetkazib beruvchi ham boʻlishi mumkin. Shartlar har filial boʻyicha alohida."
              />
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
