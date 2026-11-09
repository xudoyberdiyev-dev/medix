"use client";

import { Archive, CircleAlert, Lock, PackageOpen, Plus, ShieldAlert, Snowflake, Trash2, Truck, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { Checkbox, Radio, Switch } from "@/components/ui/selection-controls";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { Tooltip } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import type { Branch, Employee } from "./api";
import {
  bodyFromForm,
  formFromWarehouse,
  freeZoneTypes,
  REQUIRED_ZONES,
  SELLABLE_ZONES,
  validateWarehouse,
  withZone,
  type Warehouse,
  type WarehouseForm,
  type WarehouseRequest,
  type ZoneNames,
  type ZoneType,
} from "./warehouse-form";

/** Zona turi belgisi (prototip ZT): ikonka va rang tokenlari. */
export const ZONE_LOOK: Record<ZoneType, { icon: LucideIcon; className: string }> = {
  RECEIVING: { icon: PackageOpen, className: "bg-table-header text-text-secondary" },
  MAIN: { icon: Archive, className: "bg-table-header text-text-secondary" },
  COLD: { icon: Snowflake, className: "bg-info-bg text-info" },
  QUARANTINE: { icon: ShieldAlert, className: "bg-warning-bg text-warning" },
  SAFE: { icon: Lock, className: "bg-danger-bg text-danger" },
  SHIPPING: { icon: Truck, className: "bg-table-header text-text-secondary" },
};

export function ZoneChip({ type, name }: { type: ZoneType; name: string }) {
  const look = ZONE_LOOK[type];
  return (
    <span
      className={cn(
        "inline-flex h-[24px] items-center gap-[4px] rounded-[6px] px-[6px] text-caption font-medium whitespace-nowrap",
        look.className,
      )}
    >
      <Icon icon={look.icon} size="sm" />
      {name}
    </span>
  );
}

export function useZoneNames(): ZoneNames {
  const t = useTranslations("warehousePanel");
  return {
    RECEIVING: t("zn.RECEIVING"),
    MAIN: t("zn.MAIN"),
    COLD: t("zn.COLD"),
    SAFE: t("zn.SAFE"),
    QUARANTINE: t("zn.QUARANTINE"),
    SHIPPING: t("zn.SHIPPING"),
  };
}

interface Props {
  open: boolean;
  warehouse: Warehouse | null;
  /** Yangi ombor uchun oldindan tanlangan filial. */
  presetBranchId: number | null;
  branches: Branch[];
  employees: Employee[];
  onClose: () => void;
  onSave: (body: WarehouseRequest) => Promise<unknown>;
}

/** Ombor kartasi (prototip WarehousePanel): «Asosiy maʼlumotlar» va «Zonalar» yorliqlari. */
export function WarehousePanel(props: Props) {
  return <WarehousePanelInner key={`${props.warehouse?.id ?? "new"}-${props.presetBranchId ?? ""}-${props.open}`} {...props} />;
}

function WarehousePanelInner({ open, warehouse, presetBranchId, branches, employees, onClose, onSave }: Props) {
  const t = useTranslations("warehousePanel");
  const zoneNames = useZoneNames();
  const isNew = !warehouse;
  const branchOf = (id: string | null) => branches.find((b) => String(b.id) === id);
  const initial = useMemo(
    () =>
      formFromWarehouse(warehouse, {
        branchId: warehouse?.branchId ?? presetBranchId,
        branchAddress: branches.find((b) => b.id === (warehouse?.branchId ?? presetBranchId))?.address,
        zoneNames,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat panel ochilganda
    [],
  );
  const [form, setForm] = useState<WarehouseForm>(initial);
  const [tab, setTab] = useState<"basic" | "zones">("basic");
  const [tried, setTried] = useState(false);
  const [server, setServer] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);

  const branch = branchOf(form.branchId);
  const local = validateWarehouse(form);
  const err = (k: keyof typeof local) => (tried && local[k] ? t(local[k]!) : undefined);
  const errorCount = tried ? Object.keys(local).length : 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const controlled = form.zones.some((z) => z.type === "SAFE");
  const set = <K extends keyof WarehouseForm>(key: K, value: WarehouseForm[K]) => setForm((f) => ({ ...f, [key]: value }));
  const addZone = (type: ZoneType) => setForm((f) => ({ ...f, zones: withZone(f.zones, type, zoneNames[type]) }));
  const removeZone = (type: ZoneType) => setForm((f) => ({ ...f, zones: f.zones.filter((z) => z.type !== type) }));

  const keepers = employees
    .filter((e) => e.status === "ACTIVE" && (e.branchId == null || String(e.branchId) === form.branchId))
    .map((e) => ({ value: String(e.id), label: e.fullName, sub: e.roleName }));

  function goFirst() {
    const first = Object.keys(local)[0];
    if (!first) return;
    const onZones = first.startsWith("zone.");
    setTab(onZones ? "zones" : "basic");
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector<HTMLElement>(`[data-field="${first}"] input, [data-field="${first}"] button`);
      el?.focus();
      el?.scrollIntoView({ block: "center" });
    });
  }

  async function save() {
    setTried(true);
    if (Object.keys(local).length > 0) {
      goFirst();
      return;
    }
    setSaving(true);
    setServer(undefined);
    try {
      await onSave(bodyFromForm(form, branch?.address));
      onClose();
    } catch (e) {
      setServer(e instanceof ApiError ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  const requestClose = () => (dirty && !saving ? setConfirm(true) : onClose());
  const free = freeZoneTypes(form.zones);

  return (
    <>
      <Drawer
        open={open}
        onClose={requestClose}
        size="lg"
        title={isNew ? t("newTitle") : warehouse.name}
        subtitle={branch ? `${branch.code} · ${branch.name}` : undefined}
        actions={
          <>
            <Button variant="secondary" onClick={requestClose}>
              {t("cancel")}
            </Button>
            <Button onClick={save} loading={saving}>
              {t("save")}
            </Button>
          </>
        }
      >
        <div ref={bodyRef} className="flex flex-col gap-[20px]">
          {errorCount > 0 ? (
            <div
              role="alert"
              className="flex items-center gap-[10px] rounded-card border border-danger/25 bg-danger-bg px-[14px] py-[10px] text-table text-danger"
            >
              <Icon icon={CircleAlert} />
              <span className="flex-1">{t("summary", { n: errorCount })}</span>
              <button type="button" onClick={goFirst} className="font-medium underline-offset-2 hover:underline">
                {t("goFirst")}
              </button>
            </div>
          ) : null}
          {server ? <Alert tone="danger" title={server} /> : null}

          <Tabs
            aria-label={t("newTitle")}
            value={tab}
            onChange={(k) => setTab(k as "basic" | "zones")}
            items={[
              { key: "basic", label: t("tabBasic") },
              { key: "zones", label: t("tabZones"), count: form.zones.length },
            ]}
          />

          {tab === "basic" ? (
            <div className="flex flex-col gap-[16px]">
              <div data-field="branchId">
                <Select
                  label={t("branch")}
                  required
                  disabled={!isNew}
                  placeholder={t("branchPh")}
                  value={form.branchId}
                  onChange={(v) => setForm((f) => ({ ...f, branchId: v, keeperId: null, sameAddress: Boolean(branchOf(v)?.address) }))}
                  options={branches.map((b) => ({ value: String(b.id), label: b.name, meta: b.code }))}
                  error={err("branchId")}
                />
              </div>
              <div data-field="name">
                <TextField
                  label={t("name")}
                  required
                  value={form.name}
                  onChange={(v) => set("name", v)}
                  placeholder={t("namePh")}
                  error={err("name")}
                  autoFocus
                />
              </div>
              <div data-field="address" className="flex flex-col gap-[8px]">
                {branch?.address ? (
                  <Checkbox
                    label={t("same")}
                    description={branch.address}
                    checked={form.sameAddress}
                    onChange={(v) => set("sameAddress", v)}
                  />
                ) : null}
                {!form.sameAddress || !branch?.address ? (
                  <TextField
                    label={t("address")}
                    required
                    value={form.address}
                    onChange={(v) => setForm((f) => ({ ...f, address: v, sameAddress: false }))}
                    placeholder={t("addrPh")}
                    error={err("address")}
                  />
                ) : null}
              </div>
              <fieldset className="flex flex-col gap-[8px]">
                <legend className="mb-[8px] text-label font-medium">{t("type")}</legend>
                <div className="grid grid-cols-1 gap-[8px] sm:grid-cols-2">
                  <Radio
                    name="wh-kind"
                    value="NORMAL"
                    label={t("normal")}
                    description={t("normalH")}
                    checked={form.kind === "NORMAL"}
                    onChange={() => set("kind", "NORMAL")}
                  />
                  <Radio
                    name="wh-kind"
                    value="COLD"
                    label={t("coldT")}
                    description={t("coldH")}
                    checked={form.kind === "COLD"}
                    onChange={() => setForm((f) => ({ ...f, kind: "COLD", zones: withZone(f.zones, "COLD", zoneNames.COLD) }))}
                  />
                </div>
              </fieldset>
              <div className="flex flex-col gap-[8px]">
                <Checkbox
                  label={t("ctrl")}
                  description={t("ctrlHelp")}
                  checked={controlled}
                  onChange={(v) => (v ? addZone("SAFE") : removeZone("SAFE"))}
                />
                {controlled ? <Alert tone="warning" title={t("ctrlWarn")} /> : null}
              </div>
              <Select
                label={t("keeper")}
                placeholder={t("keeperPh")}
                value={form.keeperId}
                onChange={(v) => set("keeperId", v)}
                options={keepers}
                hint={keepers.length ? undefined : t("keeperHelp")}
                disabled={!keepers.length}
              />
            </div>
          ) : (
            <div className="flex flex-col gap-[12px]">
              <p className="text-table text-text-secondary">{t("zInfo")}</p>
              <ul className="flex flex-col gap-[8px]">
                {form.zones.map((z, i) => {
                  const required = REQUIRED_ZONES.includes(z.type);
                  const zoneErr = tried && local[`zone.${i}`] ? t(local[`zone.${i}`]!) : undefined;
                  return (
                    <li key={z.type} data-field={`zone.${i}`} className="rounded-modal border border-border bg-surface p-[12px]">
                      <div className="flex flex-wrap items-start gap-[12px]">
                        <TextField
                          className="min-w-[180px] flex-1"
                          label={t("zName")}
                          required
                          value={z.name}
                          placeholder={t("zNamePh")}
                          onChange={(v) =>
                            setForm((f) => ({ ...f, zones: f.zones.map((x) => (x.type === z.type ? { ...x, name: v } : x)) }))
                          }
                          error={zoneErr}
                        />
                        <div className="flex w-[132px] flex-col gap-[6px]">
                          <span className="text-label font-medium">{t("zType")}</span>
                          <ZoneChip type={z.type} name={t(`types.${z.type}`)} />
                        </div>
                        <div className="flex items-center gap-[8px] self-center">
                          <Tooltip content={t("zOpenFixed")}>
                            <span>
                              <Switch label={t("zOpen")} checked={SELLABLE_ZONES.includes(z.type)} disabled onChange={() => undefined} />
                            </span>
                          </Tooltip>
                          <Tooltip content={required ? t("zRequired") : t("zDel")}>
                            <span>
                              <Button
                                variant="icon"
                                size="sm"
                                aria-label={t("zDel")}
                                disabled={required}
                                onClick={() => removeZone(z.type)}
                                icon={Trash2}
                              />
                            </span>
                          </Tooltip>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-[8px]">
                {free.length ? (
                  <RowMenu
                    label={t("zAdd")}
                    trigger={{ icon: Plus, text: t("zAdd") }}
                    items={free.map((type) => ({
                      key: type,
                      label: type === "SAFE" ? `${t(`types.${type}`)} — ${t("ctrl")}` : t(`types.${type}`),
                      onSelect: () => addZone(type),
                    }))}
                  />
                ) : null}
                <RowMenu
                  label={t("zPreset")}
                  trigger={{ icon: Plus, text: t("zPreset") }}
                  items={[
                    { key: "std", label: t("pStd"), onSelect: () => REQUIRED_ZONES.forEach(addZone) },
                    {
                      key: "cold",
                      label: t("pCold"),
                      onSelect: () => setForm((f) => ({ ...f, kind: "COLD", zones: withZone(f.zones, "COLD", zoneNames.COLD) })),
                    },
                    { key: "ctrl", label: t("pCtrl"), onSelect: () => addZone("SAFE") },
                  ]}
                />
              </div>
            </div>
          )}
        </div>
      </Drawer>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("cTitle")}
        size="sm"
        primaryAction={{ label: t("cStay"), onClick: () => setConfirm(false) }}
        secondaryAction={{
          label: t("cLeave"),
          onClick: () => {
            setConfirm(false);
            onClose();
          },
        }}
      >
        <p className="text-body text-text-secondary">{t("cText")}</p>
      </Modal>
    </>
  );
}
