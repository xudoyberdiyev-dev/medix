"use client";

import { ArrowRight, CircleAlert, Lock, Pencil, Plus, Snowflake, Trash2, TriangleAlert, Warehouse as WarehouseIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import { useCreateWarehouse, useDeleteWarehouse, useUpdateWarehouse, type SetupStatus } from "./api";
import { describeError } from "./form-error";
import type { Warehouse } from "./warehouse-form";
import { WarehousePanel, ZoneChip } from "./warehouse-panel";
import { WizardFrame } from "./wizard-frame";

type Nav = { step: number; reachable: (i: number) => boolean; onStep: (i: number) => void };

/** 3-qadam «Omborlar va zonalar» (prototip SetupWizard W3): filial kartalari, omborlar qatorlari, ombor kartasi. */
export function WarehousesStep({ status, nav, onBack, onDone }: { status: SetupStatus; nav: Nav; onBack: () => void; onDone: () => void }) {
  const t = useTranslations("setup.warehouses");
  const ts = useTranslations("setup");
  const create = useCreateWarehouse();
  const update = useUpdateWarehouse();
  const remove = useDeleteWarehouse();
  const [panel, setPanel] = useState<{ warehouse: Warehouse | null; branchId: number | null } | null>(null);
  const [tried, setTried] = useState(false);
  const [miss, setMiss] = useState(false);
  const [del, setDel] = useState<Warehouse | null>(null);
  const { branches, warehouses, employees } = status;
  const none = warehouses.length === 0;
  const zoneCount = warehouses.reduce((n, w) => n + w.zones.length, 0);
  const missing = branches.filter((b) => !warehouses.some((w) => w.branchId === b.id));
  const delErr = describeError(remove.error);

  const next = () => {
    if (none) {
      setTried(true);
      return;
    }
    if (missing.length) {
      setMiss(true);
      return;
    }
    onDone();
  };

  const names = missing.map((b) => b.name);
  const joined = names.length > 1 ? `${names.slice(0, -1).join(", ")}${t("and")}${names[names.length - 1]}` : (names[0] ?? "");
  const zt = (k: "recv" | "store" | "cold" | "quar" | "ship") => t(`zt.${k}`);

  return (
    <WizardFrame
      {...nav}
      onBack={onBack}
      onNext={next}
      status={none ? null : ts("saved")}
      tip={t("tip")}
      aside={
        <div className="rounded-modal border border-border bg-surface p-[16px]">
          <p className="text-table font-semibold">{t("zWhat")}</p>
          <div className="mt-[12px] flex flex-col items-center justify-center gap-[12px] rounded-modal border border-divider p-[12px] py-[24px]">
            <div className="flex flex-wrap items-center justify-center gap-[4px]">
              <ZoneChip type="RECEIVING" name={zt("recv")} />
              <Icon icon={ArrowRight} size="sm" className="text-text-secondary" />
              <ZoneChip type="MAIN" name={zt("store")} />
              <Icon icon={ArrowRight} size="sm" className="text-text-secondary" />
              <ZoneChip type="SHIPPING" name={zt("ship")} />
            </div>
            <div className="flex flex-col items-center">
              <span className="h-[16px] w-px bg-border" />
              <div className="flex gap-[8px] border-t border-border pt-[4px]">
                <ZoneChip type="COLD" name={zt("cold")} />
                <ZoneChip type="QUARANTINE" name={zt("quar")} />
              </div>
            </div>
          </div>
          <p className="mt-[12px] text-caption text-text-secondary">{t("zNote")}</p>
        </div>
      }
    >
      {tried && none ? (
        <div
          role="alert"
          className="mt-[24px] flex items-center gap-[10px] rounded-card border border-danger/25 bg-danger-bg px-[14px] py-[12px] text-table text-danger"
        >
          <Icon icon={CircleAlert} />
          <span className="flex-1">{t("err")}</span>
        </div>
      ) : null}
      <p className="mt-[24px] text-table text-text-secondary">
        {t("sum", { w: formatQuantity(warehouses.length), z: formatQuantity(zoneCount), b: formatQuantity(branches.length) })}
      </p>
      <div className="mt-[12px] flex flex-col gap-[16px]">
        {branches.map((b, bi) => {
          const list = warehouses.filter((w) => w.branchId === b.id);
          const add = () => setPanel({ warehouse: null, branchId: b.id });
          return (
            <section key={b.id} aria-label={b.name} className="rounded-modal border border-border bg-surface shadow-card">
              <div className="flex min-h-[56px] flex-wrap items-center gap-[8px] border-b border-divider py-[8px] pr-[12px] pl-[20px]">
                <span className="text-section font-semibold">{b.name}</span>
                <span className="rounded-[6px] bg-table-header px-[6px] font-mono text-caption leading-[20px] text-text-secondary">
                  {b.code}
                </span>
                {list.length === 0 ? (
                  <span title={t("noneTip")} aria-label={t("noneTip")} className="flex text-warning">
                    <Icon icon={TriangleAlert} size="sm" />
                  </span>
                ) : null}
                <span className="text-table text-text-secondary">
                  {t("meta", { w: formatQuantity(list.length), z: formatQuantity(list.reduce((n, w) => n + w.zones.length, 0)) })}
                </span>
                <span className="flex-1" />
                <Button variant={none && bi === 0 ? "primary" : "tertiary"} size={none && bi === 0 ? "lg" : "sm"} icon={Plus} onClick={add}>
                  {t("add")}
                </Button>
              </div>
              {list.length === 0 ? (
                <div className="flex h-[72px] flex-wrap items-center justify-center gap-[8px] text-table text-text-secondary">
                  {t("none")}
                  <button type="button" onClick={add} className="flex items-center gap-[4px] font-medium text-primary-button">
                    <Icon icon={Plus} size="sm" />
                    {t("add")}
                  </button>
                </div>
              ) : null}
              {list.map((w, i) => (
                <Fragment key={w.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setPanel({ warehouse: w, branchId: w.branchId })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") setPanel({ warehouse: w, branchId: w.branchId });
                    }}
                    className={cn(
                      "flex min-h-[64px] cursor-pointer flex-wrap items-center gap-x-[16px] gap-y-[8px] py-[12px] pr-[12px] pl-[20px] transition-colors hover:bg-background",
                      i > 0 && "border-t border-divider",
                      i === list.length - 1 && "rounded-b-modal",
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-[36px] flex-none items-center justify-center rounded-card",
                        w.kind === "COLD" ? "bg-info-bg text-info" : "bg-table-header text-text-secondary",
                      )}
                    >
                      <Icon icon={w.kind === "COLD" ? Snowflake : WarehouseIcon} size="md" />
                    </span>
                    <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                      <span className="truncate text-body font-medium">{w.name}</span>
                      <span className="truncate text-caption text-text-secondary">{w.address ?? ""}</span>
                    </span>
                    <span className="flex flex-wrap gap-[4px]">
                      {w.zones.slice(0, 4).map((z) => (
                        <ZoneChip key={z.id} type={z.type} name={z.name} />
                      ))}
                      {w.zones.length > 4 ? (
                        <span className="h-[24px] rounded-[6px] bg-divider px-[6px] text-caption leading-[24px] font-medium text-text-secondary">
                          +{w.zones.length - 4}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-none items-center gap-[6px]" onClick={(e) => e.stopPropagation()}>
                      <span className="text-caption whitespace-nowrap text-text-secondary">
                        {employees.find((e) => e.id === w.keeperId)?.fullName ?? t("keeperNone")}
                      </span>
                      {w.zones.some((z) => z.type === "SAFE") ? (
                        <span title={t("ctrlTip")} aria-label={t("ctrlTip")} className="flex text-danger">
                          <Icon icon={Lock} size="sm" />
                        </span>
                      ) : null}
                      <Button variant="tertiary" size="sm" onClick={() => setPanel({ warehouse: w, branchId: w.branchId })}>
                        {t("edit")}
                      </Button>
                      <RowMenu
                        label={t("more")}
                        items={[
                          {
                            key: "edit",
                            label: t("edit"),
                            icon: <Icon icon={Pencil} size="sm" />,
                            onSelect: () => setPanel({ warehouse: w, branchId: w.branchId }),
                          },
                          { key: "del", label: t("del"), icon: <Icon icon={Trash2} size="sm" />, onSelect: () => setDel(w) },
                        ]}
                      />
                    </span>
                  </div>
                </Fragment>
              ))}
            </section>
          );
        })}
      </div>

      <WarehousePanel
        open={panel !== null}
        warehouse={panel?.warehouse ?? null}
        presetBranchId={panel?.branchId ?? null}
        branches={branches}
        employees={employees}
        onClose={() => setPanel(null)}
        onSave={async (body) => {
          const editing = panel?.warehouse;
          const saved = editing ? await update.mutateAsync({ id: editing.id, body }) : await create.mutateAsync(body);
          toast({
            tone: "success",
            title: editing ? t("updated", { name: saved.name }) : t("added", { name: saved.name, z: formatQuantity(saved.zones.length) }),
          });
          setTried(false);
        }}
      />

      <Modal
        open={miss}
        onClose={() => setMiss(false)}
        title={t("missT")}
        primaryAction={{
          label: t("add"),
          onClick: () => {
            setMiss(false);
            setPanel({ warehouse: null, branchId: missing[0]?.id ?? null });
          },
        }}
        secondaryAction={{
          label: t("missGo"),
          onClick: () => {
            setMiss(false);
            onDone();
          },
        }}
      >
        <p className="text-body text-text-secondary">{t(names.length > 1 ? "missMany" : "missOne", { names: joined })}</p>
      </Modal>

      <Modal
        open={del !== null}
        onClose={() => {
          setDel(null);
          remove.reset();
        }}
        tone="danger"
        size="sm"
        title={t("delT", { name: del?.name ?? "" })}
        primaryAction={{
          label: t("del"),
          loading: remove.isPending,
          onClick: () => {
            if (!del) return;
            const name = del.name;
            remove.mutate(del.id, {
              onSuccess: () => {
                toast({ tone: "success", title: t("deleted", { name }) });
                setDel(null);
              },
            });
          },
        }}
      >
        <p className="text-body text-text-secondary">{delErr.message ?? t("delText")}</p>
      </Modal>
    </WizardFrame>
  );
}
