"use client";

import { BookOpen, CircleCheck, CirclePause, Lock, Pencil, Plus, Power, PowerOff, Truck } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatQuantity } from "@/lib/format";
import { matchesSearch } from "@/lib/search";
import {
  DICTIONARIES,
  EXPENSE_PERMISSION,
  VEHICLE_PERMISSION,
  parseCapacity,
  useDictionary,
  useExpenseItems,
  useSaveEntry,
  useSaveExpenseItem,
  useSaveVehicle,
  useToggleEntry,
  useToggleExpenseItem,
  useToggleVehicle,
  useVehicles,
  type DictionaryMeta,
  type Entry,
  type ExpenseItem,
  type Vehicle,
} from "./api";

const TAB_KEYS = [...DICTIONARIES.map((d) => d.kind.toLowerCase()), "vehicles", "expense-items"];

type T = ReturnType<typeof useTranslations<"dictionaries">>;

/** Maʼlumotnoma nomlari — `dictionaries.kinds.<tur>` va `dictionaries.shortName.<tur>` dan. */
function useMetaText() {
  const t = useTranslations("dictionaries");
  return (meta: DictionaryMeta) => ({
    title: t(`kinds.${meta.kind}.title`),
    empty: t(`kinds.${meta.kind}.empty`),
    add: t(`kinds.${meta.kind}.add`),
    edit: t(`kinds.${meta.kind}.edit`),
    new: t(`kinds.${meta.kind}.new`),
    shortName:
      meta.shortName && (meta.kind === "UNIT" || meta.kind === "COUNTRY")
        ? { label: t(`shortName.${meta.kind}.label`), hint: t(`shortName.${meta.kind}.hint`), mono: meta.shortName.mono }
        : undefined,
  });
}

function ActiveBadge({ active }: { active: boolean }) {
  const t = useTranslations("dictionaries");
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

const toggleItem = (t: T, active: boolean, onSelect: () => void): RowMenuItem =>
  active
    ? { key: "deactivate", label: t("deactivate"), icon: <PowerOff size={16} strokeWidth={1.5} aria-hidden />, onSelect }
    : { key: "activate", label: t("activate"), icon: <Power size={16} strokeWidth={1.5} aria-hidden />, onSelect };

const editItem = (t: T, onSelect: () => void): RowMenuItem => ({
  key: "edit",
  label: t("edit"),
  icon: <Pencil size={16} strokeWidth={1.5} aria-hidden />,
  onSelect,
});

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const t = useTranslations("dictionaries");
  return (
    <div className="w-80">
      <TextField
        label={t("search")}
        variant="search"
        size="sm"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="[&>label]:sr-only"
      />
    </div>
  );
}

export function DictionariesPage() {
  const t = useTranslations("dictionaries");
  const text = useMetaText();
  const TABS = [
    ...DICTIONARIES.map((d) => ({ key: d.kind.toLowerCase(), label: text(d).title })),
    { key: "vehicles", label: t("vehicles") },
    { key: "expense-items", label: t("expenseItems") },
  ];
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const tab = TAB_KEYS.find((k) => k === params.get("tab")) ?? TAB_KEYS[0];
  const [creating, setCreating] = useState(false);
  const me = useMe();
  const dict = DICTIONARIES.find((d) => d.kind.toLowerCase() === tab);
  const canEdit = can(
    me.data,
    tab === "vehicles" ? VEHICLE_PERMISSION : tab === "expense-items" ? EXPENSE_PERMISSION : (dict?.permission ?? ""),
  );
  const addLabel = dict ? text(dict).add : tab === "vehicles" ? t("addVehicle") : t("addExpense");

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-4">
        <h1 className="text-page-title">{t("title")}</h1>
        {canEdit ? (
          <Button icon={Plus} onClick={() => setCreating(true)}>
            {addLabel}
          </Button>
        ) : null}
      </div>
      <div className="mb-4">
        <Tabs
          aria-label={t("title")}
          items={TABS}
          value={tab}
          onChange={(key) => (setCreating(false), router.replace(`${pathname}?tab=${key}`, { scroll: false }))}
        />
      </div>
      {dict ? (
        <DictionaryTab key={dict.kind} meta={dict} canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} />
      ) : null}
      {tab === "vehicles" ? <VehiclesTab canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} /> : null}
      {tab === "expense-items" ? <ExpenseTab canEdit={canEdit} creating={creating} onCreated={() => setCreating(false)} /> : null}
    </>
  );
}

interface TabProps {
  canEdit: boolean;
  creating: boolean;
  onCreated: () => void;
}

function DictionaryTab({ meta, canEdit, creating, onCreated }: TabProps & { meta: DictionaryMeta }) {
  const t = useTranslations("dictionaries");
  const text = useMetaText()(meta);
  const list = useDictionary(meta.kind);
  const toggle = useToggleEntry(meta.kind);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const rows = (list.data ?? []).filter((e) => matchesSearch(query, [e.name, e.shortName]));
  const columns: TableColumn<Entry>[] = [
    { key: "name", title: t("entry.name") },
    ...(text.shortName ? [{ key: "shortName", title: text.shortName.label, mono: text.shortName.mono }] : []),
    { key: "active", title: t("entry.status"), render: (e: Entry) => <ActiveBadge active={e.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption={text.title}
        columns={columns}
        rows={rows}
        rowKey={(e) => String(e.id)}
        loading={list.isPending}
        onRowClick={canEdit ? setEditing : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder={t("entry.searchPlaceholder")} />}
        rowActions={
          canEdit
            ? (e) => (
                <RowMenu
                  items={[
                    editItem(t, () => setEditing(e)),
                    toggleItem(t, !e.active, () =>
                      toggle.mutate(
                        { id: e.id, active: !e.active },
                        {
                          onSuccess: () =>
                            toast({ tone: "success", title: e.active ? t("deactivated") : t("activated"), description: e.name }),
                        },
                      ),
                    ),
                  ]}
                />
              )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={BookOpen} title={t("entry.emptyTitle")} description={text.empty} />
          )
        }
      />
      {creating || editing ? <EntryDialog meta={meta} entry={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function EntryDialog({ meta, entry, onClose }: { meta: DictionaryMeta; entry: Entry | null; onClose: () => void }) {
  const t = useTranslations("dictionaries.entry");
  const text = useMetaText()(meta);
  const save = useSaveEntry(meta.kind);
  const [name, setName] = useState(entry?.name ?? "");
  const [shortName, setShortName] = useState(entry?.shortName ?? "");
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={entry ? text.edit : text.new}
      primaryAction={{
        label: t("save"),
        loading: save.isPending,
        onClick: () =>
          save.mutate(
            { id: entry?.id, name, shortName },
            { onSuccess: (e) => (toast({ tone: "success", title: entry ? t("saved") : t("created"), description: e.name }), onClose()) },
          ),
      }}
    >
      <div className="flex flex-col gap-4">
        <TextField label={t("name")} value={name} onChange={setName} error={err.fields.name} required autoFocus />
        {text.shortName ? (
          <TextField
            label={text.shortName.label}
            value={shortName}
            onChange={setShortName}
            error={err.fields.shortName}
            hint={text.shortName.hint}
            maxLength={50}
          />
        ) : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}

function VehiclesTab({ canEdit, creating, onCreated }: TabProps) {
  const t = useTranslations("dictionaries");
  const list = useVehicles();
  const branches = useBranchList();
  const toggle = useToggleVehicle();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Vehicle | null>(null);
  const branchName = (id: number) => branches.data?.find((b) => b.id === id)?.name ?? "";
  const multiBranch = new Set((list.data ?? []).map((v) => v.branchId)).size > 1;
  const rows = (list.data ?? []).filter((v) => matchesSearch(query, [v.plateNumber, v.model, branchName(v.branchId)]));
  const columns: TableColumn<Vehicle>[] = [
    { key: "plateNumber", title: t("vehicle.plate"), mono: true },
    { key: "model", title: t("vehicle.model") },
    {
      key: "capacityBoxes",
      title: t("vehicle.capacity"),
      align: "right",
      render: (v) => (v.capacityBoxes ? t("vehicle.places", { count: formatQuantity(v.capacityBoxes) }) : "—"),
    },
    ...(multiBranch ? [{ key: "branch", title: t("vehicle.branch"), render: (v: Vehicle) => branchName(v.branchId) }] : []),
    { key: "active", title: t("vehicle.status"), render: (v: Vehicle) => <ActiveBadge active={v.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption={t("vehicles")}
        columns={columns}
        rows={rows}
        rowKey={(v) => String(v.id)}
        loading={list.isPending}
        onRowClick={canEdit ? setEditing : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder={t("vehicle.searchPlaceholder")} />}
        rowActions={
          canEdit
            ? (v) => (
                <RowMenu
                  items={[
                    editItem(t, () => setEditing(v)),
                    toggleItem(t, !v.active, () =>
                      toggle.mutate(
                        { id: v.id, active: !v.active },
                        {
                          onSuccess: () =>
                            toast({
                              tone: "success",
                              title: v.active ? t("vehicle.deactivated") : t("vehicle.activated"),
                              description: v.plateNumber,
                            }),
                        },
                      ),
                    ),
                  ]}
                />
              )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={Truck} title={t("vehicle.emptyTitle")} description={t("vehicle.emptyDescription")} />
          )
        }
      />
      {creating || editing ? <VehicleDialog vehicle={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function VehicleDialog({ vehicle, onClose }: { vehicle: Vehicle | null; onClose: () => void }) {
  const t = useTranslations("dictionaries.vehicle");
  const me = useMe();
  const branches = useBranchList();
  const save = useSaveVehicle();
  const active = (branches.data ?? []).filter((b) => b.active);
  const [branchId, setBranchId] = useState<string | null>(
    vehicle ? String(vehicle.branchId) : me.data?.branchId ? String(me.data.branchId) : active.length === 1 ? String(active[0].id) : null,
  );
  const [plate, setPlate] = useState(vehicle?.plateNumber ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [capacity, setCapacity] = useState(vehicle?.capacityBoxes ? String(vehicle.capacityBoxes) : "");
  const [local, setLocal] = useState<{ branchId?: string; capacity?: string }>({});
  const err = describeError(save.error);

  function submit() {
    const cap = parseCapacity(capacity);
    const errors = {
      branchId: branchId ? undefined : t("branchError"),
      capacity: cap === null ? t("capacityError") : undefined,
    };
    setLocal(errors);
    if (errors.branchId || errors.capacity || !branchId || cap === null) return;
    save.mutate(
      { id: vehicle?.id, branchId: Number(branchId), plateNumber: plate, model, capacityBoxes: cap },
      {
        onSuccess: (v) => (toast({ tone: "success", title: vehicle ? t("saved") : t("created"), description: v.plateNumber }), onClose()),
      },
    );
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={vehicle ? t("titleEdit", { plate: vehicle.plateNumber }) : t("titleNew")}
      primaryAction={{ label: t("save"), loading: save.isPending, onClick: submit }}
    >
      <div className="grid grid-cols-2 gap-4">
        <Select
          label={t("branch")}
          required
          value={branchId}
          onChange={setBranchId}
          error={local.branchId ?? err.fields.branchId}
          options={active.map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
          className="col-span-2"
        />
        <TextField
          label={t("plate")}
          value={plate}
          onChange={(v) => setPlate(v.toUpperCase())}
          error={err.fields.plateNumber}
          hint={t("plateHint")}
          required
          autoFocus
        />
        <TextField
          label={t("model")}
          value={model}
          onChange={setModel}
          error={err.fields.model}
          placeholder={t("modelPlaceholder")}
          required
        />
        <TextField
          label={t("capacityField")}
          value={capacity}
          onChange={setCapacity}
          error={local.capacity ?? err.fields.capacityBoxes}
          hint={t("capacityHint")}
          inputMode="numeric"
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
      </div>
    </Modal>
  );
}

function ExpenseTab({ canEdit, creating, onCreated }: TabProps) {
  const t = useTranslations("dictionaries");
  const list = useExpenseItems();
  const toggle = useToggleExpenseItem();
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const rows = (list.data ?? []).filter((e) => matchesSearch(query, [e.name]));
  const columns: TableColumn<ExpenseItem>[] = [
    {
      key: "name",
      title: t("expense.item"),
      render: (e) => (
        <span className="flex items-center gap-2">
          {e.name}
          {e.system ? (
            <span title={t("expense.systemHint")}>
              <Badge tone="neutral" icon={Lock}>
                {t("expense.system")}
              </Badge>
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "direction",
      title: t("expense.direction"),
      render: (e) => (e.direction === "EXPENSE" ? t("expense.EXPENSE") : t("expense.INCOME")),
    },
    { key: "active", title: t("expense.status"), render: (e) => <ActiveBadge active={e.active} /> },
  ];

  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  return (
    <>
      <Table
        caption={t("expense.caption")}
        columns={columns}
        rows={rows}
        rowKey={(e) => String(e.id)}
        loading={list.isPending}
        onRowClick={canEdit ? (e) => !e.system && setEditing(e) : undefined}
        toolbar={<SearchBox value={query} onChange={setQuery} placeholder={t("expense.searchPlaceholder")} />}
        rowActions={
          canEdit
            ? (e) =>
                e.system ? null : (
                  <RowMenu
                    items={[
                      editItem(t, () => setEditing(e)),
                      toggleItem(t, !e.active, () =>
                        toggle.mutate(
                          { id: e.id, active: !e.active },
                          {
                            onSuccess: () =>
                              toast({ tone: "success", title: e.active ? t("deactivated") : t("activated"), description: e.name }),
                          },
                        ),
                      ),
                    ]}
                  />
                )
            : undefined
        }
        emptyState={
          query ? (
            <NoResultsState onClearFilters={() => setQuery("")} />
          ) : (
            <EmptyState icon={BookOpen} title={t("expense.emptyTitle")} description={t("expense.emptyDescription")} />
          )
        }
      />
      {creating || editing ? <ExpenseDialog item={editing} onClose={() => (setEditing(null), onCreated())} /> : null}
    </>
  );
}

function ExpenseDialog({ item, onClose }: { item: ExpenseItem | null; onClose: () => void }) {
  const t = useTranslations("dictionaries.expense");
  const save = useSaveExpenseItem();
  const [name, setName] = useState(item?.name ?? "");
  const [direction, setDirection] = useState<string | null>(item?.direction ?? "EXPENSE");
  const err = describeError(save.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={item ? t("titleEdit") : t("titleNew")}
      primaryAction={{
        label: t("save"),
        loading: save.isPending,
        onClick: () =>
          save.mutate(
            { id: item?.id, name, direction: direction === "INCOME" ? "INCOME" : "EXPENSE" },
            {
              onSuccess: (e) => (toast({ tone: "success", title: item ? t("saved") : t("created"), description: e.name }), onClose()),
            },
          ),
      }}
    >
      <div className="flex flex-col gap-4">
        <Select
          label={t("direction")}
          required
          disabled={Boolean(item)}
          value={direction}
          onChange={setDirection}
          options={[
            { value: "EXPENSE", label: t("EXPENSE") },
            { value: "INCOME", label: t("INCOME") },
          ]}
        />
        <TextField label={t("name")} value={name} onChange={setName} error={err.fields.name} required autoFocus />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
      </div>
    </Modal>
  );
}
