"use client";

import { CircleCheck, CirclePause, MapPinned, Pencil, Plus, Power, PowerOff, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatQuantity } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import {
  SALES_ZONES_EDIT,
  SALES_ZONES_VIEW,
  useSalesZones,
  useSaveSalesZone,
  useToggleSalesZone,
  useZoneCustomers,
  type SalesZone,
  type ZoneCustomer,
} from "./api";

function StatusBadge({ active }: { active: boolean }) {
  const t = useTranslations("salesZones");
  return active ? (
    <Badge tone="success" icon={CircleCheck}>
      {t("active")}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CirclePause}>
      {t("inactive")}
    </Badge>
  );
}

/** Savdo zonalari (O6): roʻyxat, yaratish/tahrirlash, faolsizlantirish, zona mijozlari. */
export function SalesZonesPage() {
  const t = useTranslations("salesZones");
  const me = useMe();
  const canEdit = can(me.data, SALES_ZONES_EDIT);
  const list = useSalesZones();
  const toggle = useToggleSalesZone();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<SalesZone | null>(null);
  const [opened, setOpened] = useState<SalesZone | null>(null);
  const multiBranch = !!me.data?.allBranches || new Set((list.data ?? []).map((z) => z.branchId)).size > 1;
  const rows = (list.data ?? []).filter((z) => matchesSearch(query, [z.name, z.branch, z.note ?? ""]));
  if (me.data && !canAny(me.data, [SALES_ZONES_VIEW, SALES_ZONES_EDIT])) return <ForbiddenState />;

  const columns: TableColumn<SalesZone>[] = [
    {
      key: "name",
      title: t("col.name"),
      render: (z) => (
        <div className="flex flex-col">
          <span className="font-medium">{z.name}</span>
          {z.note ? <span className="text-caption text-text-secondary">{z.note}</span> : null}
        </div>
      ),
    },
    ...(multiBranch ? [{ key: "branch", title: t("col.branch"), render: (z: SalesZone) => z.branch }] : []),
    { key: "customers", title: t("col.customers"), align: "right" as const, render: (z: SalesZone) => formatQuantity(z.customers) },
    { key: "active", title: t("col.status"), render: (z: SalesZone) => <StatusBadge active={z.active} /> },
  ];

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-page-title">{t("title")}</h1>
          <p className="text-caption text-text-secondary">{t("subtitle")}</p>
        </div>
        {canEdit ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {t("add")}
          </Button>
        ) : null}
      </div>
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={rows}
          rowKey={(z) => String(z.id)}
          loading={list.isPending}
          onRowClick={setOpened}
          toolbar={
            <div className="w-80">
              <TextField
                label={t("search")}
                variant="search"
                size="sm"
                value={query}
                onChange={setQuery}
                placeholder={t("searchPlaceholder")}
                className="[&>label]:sr-only"
              />
            </div>
          }
          rowActions={
            canEdit
              ? (z) => (
                  <RowMenu
                    items={[
                      {
                        key: "edit",
                        label: t("edit"),
                        icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
                        onSelect: () => setEditing(z),
                      },
                      {
                        key: z.active ? "deactivate" : "activate",
                        label: z.active ? t("deactivate") : t("activate"),
                        icon: z.active ? (
                          <PowerOff size={16} strokeWidth={1.5} aria-hidden />
                        ) : (
                          <Power size={16} strokeWidth={1.5} aria-hidden />
                        ),
                        onSelect: () =>
                          toggle.mutate(
                            { id: z.id, active: !z.active },
                            {
                              onSuccess: () =>
                                toast({ tone: "success", title: z.active ? t("deactivated") : t("activated"), description: z.name }),
                            },
                          ),
                      },
                    ]}
                  />
                )
              : undefined
          }
          emptyState={
            query ? (
              <NoResultsState onClearFilters={() => setQuery("")} />
            ) : (
              <EmptyState icon={MapPinned} title={t("emptyTitle")} description={t("emptyDescription")} />
            )
          }
        />
      )}
      {creating || editing ? <ZoneDialog zone={editing} onClose={() => (setEditing(null), setCreating(false))} /> : null}
      {opened ? <ZoneCustomersDialog zone={opened} onClose={() => setOpened(null)} /> : null}
    </>
  );
}

function ZoneDialog({ zone, onClose }: { zone: SalesZone | null; onClose: () => void }) {
  const t = useTranslations("salesZones");
  const me = useMe();
  const branches = useBranchList();
  const save = useSaveSalesZone();
  const active = (branches.data ?? []).filter((b) => b.active && (me.data?.allBranches || b.id === me.data?.branchId));
  const [branchId, setBranchId] = useState<string | null>(
    zone ? String(zone.branchId) : me.data?.branchId ? String(me.data.branchId) : active.length === 1 ? String(active[0].id) : null,
  );
  const [name, setName] = useState(zone?.name ?? "");
  const [note, setNote] = useState(zone?.note ?? "");
  const [local, setLocal] = useState<{ branchId?: string; name?: string }>({});
  const err = describeError(save.error);

  function submit() {
    const errors = { branchId: branchId ? undefined : t("branchError"), name: name.trim() ? undefined : t("nameError") };
    setLocal(errors);
    if (errors.branchId || errors.name || !branchId) return;
    save.mutate(
      { id: zone?.id, branchId: Number(branchId), name: name.trim(), note: note.trim() || undefined },
      { onSuccess: (z) => (toast({ tone: "success", title: zone ? t("saved") : t("created"), description: z.name }), onClose()) },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={zone ? t("titleEdit", { name: zone.name }) : t("titleNew")}
      primaryAction={{ label: t("save"), loading: save.isPending, onClick: submit }}
    >
      <div className="grid grid-cols-1 gap-4">
        <Select
          label={t("branch")}
          required
          value={branchId}
          onChange={setBranchId}
          error={local.branchId ?? err.fields.branchId}
          disabled={active.length <= 1 && !!branchId}
          options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
        />
        <TextField
          label={t("name")}
          value={name}
          onChange={setName}
          error={local.name ?? err.fields.name}
          placeholder={t("namePlaceholder")}
          hint={t("nameHint")}
          required
          autoFocus
        />
        <TextField label={t("note")} value={note} onChange={setNote} error={err.fields.note} placeholder={t("notePlaceholder")} />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}

function ZoneCustomersDialog({ zone, onClose }: { zone: SalesZone; onClose: () => void }) {
  const t = useTranslations("salesZones");
  const list = useZoneCustomers(zone.id);
  const columns: TableColumn<ZoneCustomer>[] = [
    {
      key: "name",
      title: t("customers.name"),
      render: (c) => (
        <Link href={`/customers/${c.id}`} className="text-primary hover:underline">
          {c.name}
        </Link>
      ),
    },
    { key: "tin", title: t("customers.tin"), mono: true, render: (c) => c.tin ?? "—" },
    { key: "region", title: t("customers.region"), render: (c) => c.region ?? "—" },
    { key: "active", title: t("col.status"), render: (c) => <StatusBadge active={c.active} /> },
  ];
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t("customers.title", { name: zone.name })}
      primaryAction={{ label: t("close"), onClick: onClose }}
    >
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("customers.title", { name: zone.name })}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(c) => String(c.id)}
          loading={list.isPending}
          emptyState={<EmptyState icon={Users} title={t("customers.emptyTitle")} description={t("customers.emptyDescription")} />}
        />
      )}
    </Modal>
  );
}
