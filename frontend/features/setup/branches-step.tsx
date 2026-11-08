"use client";

import { Building2, CircleAlert, CircleCheck, Hash, Landmark, MapPin, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { toast } from "@/components/ui/toast";
import { BranchPanel } from "@/features/organization/branch-panel";
import { cn } from "@/lib/cn";
import { useCreateBranch, useUpdateBranch, type Branch, type SetupStatus } from "./api";
import { WizardFrame, type WizardFrameProps } from "./wizard-frame";

type Nav = Pick<WizardFrameProps, "step" | "reachable" | "onStep">;

/** 2-qadam — Filiallar (prototip SetupWizard): boʻsh holat yoki kartalar, yon panel BranchPanel. */
export function BranchesStep({ status, nav, onBack, onDone }: { status: SetupStatus; nav: Nav; onBack: () => void; onDone: () => void }) {
  const t = useTranslations("setup.branchesStep");
  const ts = useTranslations("setup");
  const tb = useTranslations("branchPanel");
  const create = useCreateBranch();
  const update = useUpdateBranch();
  const [panel, setPanel] = useState<{ branch: Branch | null } | null>(null);
  const [tried, setTried] = useState(false);
  const branches = status.branches;
  const whCount = (id: number) => status.warehouses.filter((w) => w.branchId === id).length;

  const next = () => {
    if (branches.length === 0) {
      setTried(true);
      return;
    }
    onDone();
  };

  return (
    <WizardFrame
      {...nav}
      onBack={onBack}
      onNext={next}
      status={branches.length > 0 ? ts("saved") : null}
      tip={t("tip")}
      aside={
        <div className="rounded-modal border border-border bg-surface p-[16px]">
          <p className="text-table font-semibold">{t("whatTitle")}</p>
          <div className="mt-[12px] flex flex-col">
            <span className="self-start rounded-card bg-brand-900 px-[12px] py-[6px] text-table font-semibold text-white">
              {status.company?.name ?? "MEDIX"}
            </span>
            <div className="ml-[16px] flex flex-col gap-[8px] border-l border-border pt-[8px] pl-[12px]">
              {(branches.length ? branches.slice(0, 3) : [null, null]).map((b, i) => (
                <div
                  key={b?.id ?? `ph${i}`}
                  className={cn(
                    "flex h-[32px] items-center gap-[8px] rounded-card px-[10px] text-caption",
                    b ? "border border-border bg-surface" : "border border-dashed border-border bg-table-header",
                  )}
                >
                  {b ? (
                    <>
                      <span className="font-mono text-text-secondary">{b.code}</span>
                      <span className="truncate">{b.name}</span>
                    </>
                  ) : null}
                </div>
              ))}
            </div>
            <ul className="mt-[16px] flex flex-col gap-[6px] pl-[8px] text-caption text-text-secondary">
              <li>{t("what1")}</li>
              <li>{t("what2")}</li>
              <li>{t("what3")}</li>
            </ul>
          </div>
        </div>
      }
    >
      {tried && branches.length === 0 ? (
        <div
          role="alert"
          className="mb-[16px] flex items-center gap-[10px] rounded-card border border-danger/25 bg-danger-bg px-[14px] py-[10px] text-table text-danger"
        >
          <Icon icon={CircleAlert} />
          <span className="flex-1">{t("err")}</span>
          <button type="button" onClick={() => setPanel({ branch: null })} className="font-medium hover:underline">
            {t("add")}
          </button>
        </div>
      ) : null}

      {branches.length === 0 ? (
        <div className="flex flex-col items-center rounded-modal border border-border bg-surface px-[24px] py-[48px] text-center">
          <span className="flex size-[48px] items-center justify-center rounded-full bg-primary-soft text-primary-button">
            <Building2 size={22} strokeWidth={1.5} aria-hidden />
          </span>
          <p className="mt-[16px] text-subtitle">{t("emptyTitle")}</p>
          <p className="mt-[4px] max-w-[300px] text-body text-text-secondary">{t("emptyText")}</p>
          <Button className="mt-[20px]" icon={Plus} onClick={() => setPanel({ branch: null })}>
            {t("first")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-[12px]">
          <div className="flex items-center justify-between">
            <span className="text-body font-semibold">{t("count", { n: branches.length })}</span>
            <Button variant="secondary" icon={Plus} onClick={() => setPanel({ branch: null })}>
              {t("add")}
            </Button>
          </div>
          <ul className="grid grid-cols-1 gap-[12px] md:grid-cols-2">
            {branches.map((b) => {
              const wh = whCount(b.id);
              return (
                <li
                  key={b.id}
                  className="flex flex-col gap-[6px] rounded-modal border border-border bg-surface p-[16px] transition-colors hover:border-text-disabled"
                >
                  <div className="flex items-center gap-[8px]">
                    <span className="truncate text-body font-semibold">{b.name}</span>
                    <span className="rounded-sm bg-background px-[6px] font-mono text-caption text-text-secondary">{b.code}</span>
                    <span className="flex-1" />
                    <span className={cn("flex items-center gap-[4px] text-caption", b.active ? "text-success" : "text-text-secondary")}>
                      <CircleCheck size={12} strokeWidth={1.5} aria-hidden />
                      {b.active ? t("active") : t("inactive")}
                    </span>
                  </div>
                  <p className="truncate text-table text-text-secondary">{b.legalName}</p>
                  <p className="flex flex-wrap items-center gap-x-[6px] text-caption text-text-secondary">
                    <span className="flex items-center gap-[4px]">
                      <Hash size={12} strokeWidth={1.5} aria-hidden />
                      <span className="font-mono">{b.tin}</span>
                    </span>
                    {b.region ? (
                      <>
                        <span>·</span>
                        <span className="flex items-center gap-[4px]">
                          <MapPin size={12} strokeWidth={1.5} aria-hidden />
                          {b.region}
                        </span>
                      </>
                    ) : null}
                    <span>·</span>
                    <span className="flex items-center gap-[4px]">
                      <Landmark size={12} strokeWidth={1.5} aria-hidden />
                      {t("banks", { n: b.bankAccounts.length })}
                    </span>
                  </p>
                  <div className="mt-[6px] flex items-center gap-[8px] border-t border-border pt-[10px]">
                    <span className="flex-1 text-caption text-text-secondary">{wh ? t("wh", { n: wh }) : t("noWh")}</span>
                    <Button variant="tertiary" size="sm" onClick={() => setPanel({ branch: b })}>
                      {t("edit")}
                    </Button>
                  </div>
                </li>
              );
            })}
            <li>
              <button
                type="button"
                onClick={() => setPanel({ branch: null })}
                className="flex h-full min-h-[132px] w-full items-center justify-center gap-[8px] rounded-modal border border-dashed border-border text-table text-text-secondary transition-colors hover:border-primary-button hover:bg-primary-soft hover:text-primary-button"
              >
                <Plus size={20} strokeWidth={1.5} aria-hidden />
                {t("add")}
              </button>
            </li>
          </ul>
        </div>
      )}

      <BranchPanel
        open={panel !== null}
        branch={panel?.branch}
        onClose={() => setPanel(null)}
        onSave={async (body) => {
          const editing = panel?.branch;
          const saved = editing ? await update.mutateAsync({ id: editing.id, body }) : await create.mutateAsync(body);
          toast({ tone: "success", title: tb(editing ? "updated" : "added", { name: saved.name }) });
          setTried(false);
        }}
      />
    </WizardFrame>
  );
}
