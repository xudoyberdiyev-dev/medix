"use client";

import { useQueries } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Building,
  Building2,
  CircleCheck,
  CircleX,
  Rocket,
  ShieldCheck,
  TriangleAlert,
  UsersRound,
  Warehouse,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Icon, type LucideIcon } from "@/components/ui/icon";
import { Modal } from "@/components/ui/modal";
import { useEmployees, useSeats, type Employee } from "@/features/employees/api";
import { staffStatus } from "@/features/employees/staff";
import { useRoleMatrix } from "@/features/roles/roles-matrix";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { useCompleteSetup, type SetupStatus } from "./api";
import { describeError } from "./form-error";

type Issue = { text: string; step: number };

const stir = (s: string) => s.replace(/\D/g, "").replace(/(\d{3})(\d{3})(\d{3})/, "$1 $2 $3");

/**
 * 6-qadam «Yakun» (prototip WizFinish): tayyorlik roʻyxati (kompaniya, filiallar, omborlar va zonalar, rollar, xodimlar),
 * muammolar (server bloklovchilari) va ogohlantirishlar (operator/ombor mudiri yoʻq filial, kassirsiz kassa),
 * «Keyingi qadamlar», ishga tushirishni tasdiqlash oynasi va yakun ekrani.
 */
export function FinishStep({
  status: s,
  stepOf,
  onGo,
  onBack,
  onLaunching,
}: {
  status: SetupStatus;
  stepOf: string;
  /** Ishga tushirish boshlandi/bekor boʻldi — ota komponent «yakunlangan» ekraniga oʻtib ketmasin. */
  onLaunching: (v: boolean) => void;
  onGo: (step: number) => void;
  onBack: () => void;
}) {
  const t = useTranslations("setup.finish");
  const router = useRouter();
  const complete = useCompleteSetup();
  const emps = useEmployees();
  const seats = useSeats();
  const matrix = useRoleMatrix();
  const cashes = useQueries({
    queries: s.branches.map((b) => ({
      queryKey: ["money-accounts", "list", b.id],
      queryFn: () => unwrap(api.GET("/api/money-accounts", { params: { query: { branchId: b.id } } })),
      retry: false,
    })),
    combine: (rs) => rs.flatMap((r) => (r.data ?? []).filter((a) => a.kind === "CASH" && a.active)),
  });
  const [dlg, setDlg] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [target, setTarget] = useState("/");
  const err = describeError(complete.error);

  const live: Employee[] = (emps.data ?? s.employees).filter((e) => e.status !== "BLOCKED");
  const grants = matrix.data?.grants ?? {};
  const roles = (matrix.data?.roles ?? []).filter((r) => r.active);
  const can = (code: string, key: string) => code === "DIRECTOR" || (grants[code] ?? []).includes(key);
  const home = (code: string) => matrix.data?.roles.find((r) => r.code === code)?.home;
  const zones = s.warehouses.flatMap((w) => w.zones);
  const zc = (type: string) => zones.filter((z) => z.type === type).length;
  const tin = s.branches.find((b) => b.tin)?.tin;
  const fresh = live.filter((e) => staffStatus(e) === "new").length;
  const std = roles.filter((r) => r.system).length;
  const nw = roles.length - std;
  const limit = seats.data?.limit ?? null;

  const blk: Issue[] = s.blockers.map((text) => ({ text, step: text.includes("ompaniya") ? 0 : s.branches.length ? 2 : 1 }));
  const wrn: Issue[] = [];
  for (const b of s.branches) {
    const here = live.filter((e) => e.branchId === b.id);
    if (!here.some((e) => home(e.roleCode) === "operator")) wrn.push({ text: t("wNoOp", { b: b.name }), step: 4 });
    if (!here.some((e) => e.roleCode !== "DIRECTOR" && can(e.roleCode, "special.whs")))
      wrn.push({ text: t("wNoKeeper", { b: b.name }), step: 4 });
  }
  for (const a of cashes) {
    if (!live.some((e) => e.cashAccountIds.includes(a.id))) wrn.push({ text: t("wNoCashier", { k: a.name }), step: 4 });
  }

  const company = s.company?.name ?? "—";
  const items: { icon: LucideIcon; label: string; value: string; step: number; bad?: boolean }[] = [
    {
      icon: Building,
      label: t("kCo"),
      value: tin ? t("vCo", { n: company, s: stir(tin) }) : t("vCoNoStir", { n: company }),
      step: 0,
      bad: !s.company,
    },
    { icon: Building2, label: t("kBr"), value: String(s.branches.length), step: 1, bad: !s.branches.length },
    {
      icon: Warehouse,
      label: t("kWh"),
      value: t("vWh", { w: s.warehouses.length, z: zones.length, c: zc("COLD"), q: zc("QUARANTINE"), s: zc("SAFE") }),
      step: 2,
      bad: !s.warehouses.length,
    },
    { icon: ShieldCheck, label: t("kRl"), value: t("vRl", { n: std }) + (nw ? t("vRlNew", { n: nw }) : ""), step: 3 },
    {
      icon: UsersRound,
      label: t("kEmp"),
      value: limit ? t("vEmp", { n: live.length, m: limit, k: fresh }) : t("vEmpFree", { n: live.length, k: fresh }),
      step: 4,
    },
  ];
  const nexts = [
    { label: t("n1"), href: "/products" },
    { label: t("n2"), href: "/customers" },
    { label: t("n3"), href: "/prices" },
    { label: t("n4"), href: "/opening" },
  ];

  const launch = (to: string) => {
    if (blk.length) return;
    setTarget(to);
    setDlg(true);
  };

  if (done) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="flex w-[480px] max-w-full flex-col items-center gap-3 rounded-card border border-border bg-surface p-8 text-center shadow-card">
          <span className="flex size-16 items-center justify-center rounded-full bg-success-bg text-success">
            <CircleCheck size={40} strokeWidth={1.5} aria-hidden />
          </span>
          <h1 className="mt-2 text-[22px] leading-[28px] font-semibold">{t("okT")}</h1>
          <p className="text-body text-pretty text-text-secondary">{t("okD")}</p>
          <Button size="lg" className="mt-3" onClick={() => router.replace(done)}>
            {t("goHome")}
            <Icon icon={ArrowRight} />
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-64px)] flex-col">
      <div className="flex-1 px-6 pt-8 pb-6">
        <div className="mx-auto flex max-w-[880px] flex-col gap-5">
          <div className="flex flex-col">
            <span className="text-caption font-medium text-primary-button">{stepOf}</span>
            <h1 className="mt-1.5 text-[26px] leading-[32px] font-semibold tracking-[-0.01em]">{t("t6")}</h1>
            <p className="mt-2 text-body text-pretty text-text-secondary">{t("d6")}</p>
          </div>

          <section className="rounded-card border border-border bg-surface shadow-card">
            <h2 className="border-b border-border-subtle px-5 py-4 text-[15px] leading-[22px] font-semibold">{t("rdT")}</h2>
            {items.map((it) => (
              <div key={it.label} className="flex items-center gap-3.5 border-b border-border-subtle px-5 py-3.5 last:border-b-0">
                <span
                  className={cn(
                    "flex size-8 flex-none items-center justify-center rounded-control",
                    it.bad ? "bg-danger-bg text-danger" : "bg-success-bg text-success",
                  )}
                >
                  <Icon icon={it.icon} />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="text-table text-text-secondary">{it.label}</span>
                  <span className="text-body font-medium text-pretty">{it.value}</span>
                </div>
                <button
                  type="button"
                  className="flex-none text-table font-medium text-primary-button hover:underline"
                  onClick={() => onGo(it.step)}
                >
                  {t("edit")}
                </button>
              </div>
            ))}
          </section>

          {blk.length ? <IssueBox tone="danger" title={t("blkT", { n: blk.length })} items={blk} onGo={onGo} edit={t("edit")} /> : null}
          {wrn.length ? <IssueBox tone="warning" title={t("wrnT", { n: wrn.length })} items={wrn} onGo={onGo} edit={t("edit")} /> : null}
          {err.message ? <Alert tone="danger" title={err.message} /> : null}

          <section className="rounded-card border border-border bg-surface shadow-card">
            <div className="flex flex-col border-b border-border-subtle px-5 py-4">
              <h2 className="text-[15px] leading-[22px] font-semibold">{t("nextT")}</h2>
              <span className="text-caption text-text-muted">{t("nAfter")}</span>
            </div>
            {nexts.map((n, i) => (
              <button
                key={n.href}
                type="button"
                onClick={() => launch(n.href)}
                className="flex w-full items-center gap-3.5 border-b border-border-subtle px-5 py-3 text-left last:border-b-0 hover:bg-background"
              >
                <span className="flex size-6 flex-none items-center justify-center rounded-full bg-primary-soft text-caption font-semibold text-primary-button">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 text-body font-medium text-primary-button">{n.label}</span>
                <Icon icon={ArrowRight} className="text-text-muted" />
              </button>
            ))}
          </section>
        </div>
      </div>

      <footer className="sticky bottom-0 z-10 h-[72px] flex-none border-t border-border bg-surface px-6">
        <div className="mx-auto flex h-full max-w-[880px] items-center justify-between gap-4">
          <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={onBack}>
            {t("back")}
          </Button>
          <Button size="lg" icon={Rocket} disabled={blk.length > 0} onClick={() => launch("/")}>
            {t("launch")}
          </Button>
        </div>
      </footer>

      <Modal
        open={dlg}
        onClose={() => setDlg(false)}
        title={t("lnT")}
        primaryAction={{
          label: wrn.length ? t("anyway") : t("launch"),
          loading: complete.isPending,
          onClick: () => {
            onLaunching(true);
            complete.mutate(undefined, {
              onSuccess: () => {
                setDlg(false);
                setDone(target);
              },
              onError: () => {
                onLaunching(false);
                setDlg(false);
              },
            });
          },
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setDlg(false) }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body">
            {t("lnText", { b: s.branches.length, w: s.warehouses.length, z: zones.length, r: roles.length, e: live.length, l: fresh })}
          </p>
          {wrn.length ? (
            <span className="flex items-center gap-2 text-table text-warning">
              <Icon icon={TriangleAlert} />
              {t("wrnT", { n: wrn.length })}
            </span>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function IssueBox({
  tone,
  title,
  items,
  onGo,
  edit,
}: {
  tone: "danger" | "warning";
  title: string;
  items: Issue[];
  onGo: (step: number) => void;
  edit: string;
}) {
  const danger = tone === "danger";
  return (
    <section
      className={cn(
        "flex flex-col gap-2.5 rounded-card border px-5 py-4",
        danger ? "border-danger/30 bg-danger-bg" : "border-warning/30 bg-warning-bg",
      )}
    >
      <span className={cn("flex items-center gap-2 text-body font-semibold", danger ? "text-danger" : "text-warning")}>
        <Icon icon={danger ? CircleX : TriangleAlert} />
        {title}
      </span>
      {items.map((b) => (
        <div key={b.text} className="flex items-center gap-2.5 text-table">
          <span className="min-w-0 flex-1">{b.text}</span>
          <button
            type="button"
            className={cn("flex-none font-medium underline underline-offset-2", danger ? "text-danger" : "text-warning")}
            onClick={() => onGo(b.step)}
          >
            {edit}
          </button>
        </div>
      ))}
    </section>
  );
}
