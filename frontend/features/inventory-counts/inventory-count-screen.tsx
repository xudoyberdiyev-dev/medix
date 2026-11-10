"use client";

import {
  ArrowLeft,
  Boxes,
  Check,
  CircleDashed,
  CloudCheck,
  Eye,
  EyeOff,
  HardDrive,
  Info,
  LockKeyhole,
  PackageOpen,
  PackagePlus,
  SearchX,
  ShieldAlert,
  Snowflake,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { can, canAny } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { formatDate, formatQuantity } from "@/lib/format";
import { AddFound } from "./add-found";
import {
  IN_COUNT,
  IN_VIEW_KEYS,
  useInventoryCount,
  useSaveCounts,
  useSubmitInventoryCount,
  type InventoryCountDetail,
  type InventoryCountLine,
} from "./api";

const ZONE_ICON: Record<string, LucideIcon> = {
  RECEIVING: PackageOpen,
  MAIN: Boxes,
  QUARANTINE: ShieldAlert,
  SHIPPING: Truck,
  COLD: Snowflake,
  SAFE: LockKeyhole,
};
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const todayIso = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Kiritilgan matn: boʻsh — null, butun son — son, aks holda NaN. */
export function parseCount(v: string): number | null {
  const s = v.replace(/\s/g, "").replace(/\./g, "");
  if (s === "") return null;
  return /^\d+$/.test(s) ? Number(s) : Number.NaN;
}

/** Sanoq ekrani (prototip `InventoryCount`, planshet): zonalar boʻyicha boʻlimlar, katta kiritish maydoni, «Topilmadi», avtomatik saqlash. */
export function InventoryCountScreen({ id }: { id: number }) {
  const t = useTranslations("inventoryCounts");
  const me = useMe();
  const q = useInventoryCount(id);
  if (me.data && !canAny(me.data, IN_VIEW_KEYS)) return <ForbiddenState description={t("forbidden")} />;
  if (q.error) return <ErrorState onRetry={() => void q.refetch()} />;
  if (!q.data) return <Skeleton className="h-96 w-full" />;
  return <Screen key={q.data.id} doc={q.data} />;
}

function Screen({ doc }: { doc: InventoryCountDetail }) {
  const t = useTranslations("inventoryCounts");
  const router = useRouter();
  const me = useMe();
  const save = useSaveCounts();
  const submit = useSubmitInventoryCount();
  const [vals, setVals] = useState<Record<number, string>>(() =>
    Object.fromEntries(doc.lines.map((l) => [l.id, l.countedQty == null ? "" : String(l.countedQty)])),
  );
  const [queue, setQueue] = useState<Record<number, number>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [dlg, setDlg] = useState<"finish" | "unc" | "found" | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counting = doc.status === "COUNTING";
  const canEdit = counting && can(me.data, IN_COUNT);
  const open = !doc.bookHidden;

  // Navbatdagi oʻzgarishlar 600 ms dan keyin bitta soʻrov bilan saqlanadi
  useEffect(() => {
    const entries = Object.entries(queue).map(([lineId, countedQty]) => ({ lineId: Number(lineId), countedQty }));
    if (!entries.length) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      save.mutate(
        { id: doc.id, entries },
        {
          onSuccess: () => {
            setQueue((cur) =>
              Object.fromEntries(
                Object.entries(cur).filter(([k, v]) => !entries.some((e) => e.lineId === Number(k) && e.countedQty === v)),
              ),
            );
            setSavedAt(new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" }));
          },
          onError: (e) => toast({ tone: "danger", title: t("doc.saveErr"), description: describeError(e).message ?? t("doc.retry") }),
        },
      );
    }, 600);
    return () => (timer.current ? clearTimeout(timer.current) : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat navbat oʻzgarganda
  }, [queue]);

  const setVal = (l: InventoryCountLine, v: string) => {
    if (!canEdit) return toast({ tone: "info", title: t("doc.tNotCount") });
    setVals((s) => ({ ...s, [l.id]: v }));
    const n = parseCount(v);
    if (n !== null && !Number.isNaN(n)) setQueue((s) => ({ ...s, [l.id]: n }));
  };

  const valOf = (l: InventoryCountLine) => vals[l.id] ?? (l.countedQty == null ? "" : String(l.countedQty));
  const countedOf = (l: InventoryCountLine) => {
    const n = parseCount(valOf(l));
    return n === null || Number.isNaN(n) ? null : n;
  };
  const done = doc.lines.filter((l) => countedOf(l) != null).length;
  const total = doc.lines.length;
  const pct = total ? Math.round((done * 100) / total) : 0;
  const unc = doc.lines.filter((l) => countedOf(l) == null);
  const zones = [...new Map(doc.lines.map((l) => [l.zone.id, l.zone])).values()];
  const zoneNames = doc.scopeMode === "WAREHOUSE" ? t("doc.mWh") : zones.map((z) => z.name).join(", ");

  const finish = (zero: boolean) => {
    const all: Record<number, number> = { ...queue };
    if (zero) for (const l of unc) all[l.id] = 0;
    const entries = Object.entries(all).map(([lineId, countedQty]) => ({ lineId: Number(lineId), countedQty }));
    if (timer.current) clearTimeout(timer.current);
    const go = () =>
      submit.mutate(doc.id, {
        onSuccess: (d) => {
          toast({ tone: "success", title: t("doc.tFinished", { n: d.number }) });
          router.push(`/inventory-counts/${doc.id}`);
        },
        onError: (e) => (
          setDlg(null),
          toast({ tone: "danger", title: t("doc.failed"), description: describeError(e).message ?? t("doc.retry") })
        ),
      });
    if (!entries.length) return go();
    save.mutate(
      { id: doc.id, entries },
      {
        onSuccess: () => (setQueue({}), go()),
        onError: (e) => toast({ tone: "danger", title: t("doc.saveErr"), description: describeError(e).message ?? t("doc.retry") }),
      },
    );
  };

  return (
    <div className="-m-6 flex min-h-[calc(100%+48px)] flex-col bg-background text-[15px]">
      <header className="flex flex-wrap items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <Link
          href={`/inventory-counts/${doc.id}`}
          className="inline-flex h-11 items-center gap-1.5 rounded-control border border-border px-3 text-[14px] font-medium hover:bg-background"
        >
          <ArrowLeft size={18} strokeWidth={1.5} aria-hidden />
          {t("doc.back")}
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <h1 className="text-[18px] leading-6 font-semibold">{t("doc.countTitle", { n: doc.number })}</h1>
          <span className="truncate text-[13px] text-text-secondary">
            {doc.warehouse} · {zoneNames}
          </span>
        </div>
        {canEdit ? (
          <Button variant="secondary" icon={PackagePlus} onClick={() => setDlg("found")}>
            {t("doc.addFound")}
          </Button>
        ) : null}
        <span className="text-[14px] font-semibold tabular-nums">
          {formatQuantity(done)} / {formatQuantity(total)} <span className="font-normal text-text-secondary">{t("doc.rowsU")}</span>
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-[1100px] flex-1 flex-col gap-4 px-4 pt-4 pb-32">
        {!counting ? <Alert tone="info" icon={Info} title={t("doc.tNotCount")} /> : null}
        {doc.blind ? (
          <Alert tone="info" icon={EyeOff} title={open ? t("doc.bBlindMgr") : t("doc.bBlind")} />
        ) : (
          <Alert tone="info" icon={Eye} title={t("doc.bOpen")} />
        )}
        {zones.map((z) => {
          const ls = doc.lines.filter((l) => l.zone.id === z.id);
          const I = ZONE_ICON[z.type] ?? Boxes;
          return (
            <section key={z.id} className="overflow-hidden rounded-[12px] border border-border bg-surface">
              <div className="flex items-center gap-2 border-b border-border bg-table-header px-4 py-3">
                <I size={18} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                <span className="font-semibold">{z.name}</span>
                <span className="flex-1" />
                <span className="text-[13px] text-text-secondary tabular-nums">
                  {t("doc.secProg", { d: ls.filter((l) => countedOf(l) != null).length, n: ls.length })}
                </span>
              </div>
              {ls.map((l) => {
                const v = valOf(l);
                const bad = Number.isNaN(parseCount(v));
                const cnt = countedOf(l) != null;
                const expired = l.expiryDate < todayIso();
                return (
                  <div
                    key={l.id}
                    className="grid min-h-[68px] grid-cols-[minmax(0,1fr)_150px_auto] items-center gap-3 border-b border-border px-4 py-2.5 last:border-b-0"
                    style={{ boxShadow: cnt ? "inset 4px 0 0 var(--color-primary)" : undefined }}
                  >
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold">
                        <span className="truncate">{l.productName}</span>
                        {l.controlled ? (
                          <ShieldAlert size={14} strokeWidth={1.5} className="shrink-0 text-danger" aria-label={t("doc.ctrl")} />
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
                        <span className="font-mono text-text-primary">{l.batchNumber}</span>
                        <span className={expired ? "text-danger" : undefined}>{day(l.expiryDate)}</span>
                        {expired ? <span className="text-danger">{t("doc.toQuar")}</span> : null}
                        {open && l.bookQty != null ? <span>· {t("doc.bookN", { n: formatQuantity(l.bookQty) })}</span> : null}
                        {l.added ? <span>· {t("doc.foundTag")}</span> : null}
                      </span>
                    </div>
                    <input
                      value={v}
                      onChange={(e) => setVal(l, e.target.value)}
                      onFocus={(e) => e.target.select()}
                      inputMode="numeric"
                      aria-label={t("doc.countedLabel", { p: l.productName, b: l.batchNumber })}
                      placeholder="—"
                      disabled={!canEdit}
                      className={cn(
                        "h-11 w-full min-w-0 rounded-[10px] border bg-surface px-3.5 text-right text-[18px] font-semibold tabular-nums outline-none focus:ring-2 focus:ring-primary/30",
                        bad ? "border-danger" : cnt ? "border-primary" : "border-border",
                      )}
                    />
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => setVal(l, "0")}
                      title={t("doc.notFound")}
                      className="inline-flex h-11 items-center gap-1.5 rounded-[10px] border border-border bg-surface px-3 text-[13px] font-medium text-text-secondary hover:bg-background disabled:opacity-50"
                    >
                      <SearchX size={16} strokeWidth={1.5} aria-hidden />
                      {t("doc.notFoundBtn")}
                    </button>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      <div className="sticky bottom-0 z-10 border-t border-border bg-surface shadow-[0_-4px_12px_rgba(18,60,58,0.06)]">
        <div className="h-1 bg-table-header">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
        <div className="mx-auto flex w-full max-w-[1100px] items-center gap-4 px-4 py-3">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="text-[17px] font-semibold tabular-nums">
              {t("doc.progText", { d: formatQuantity(done), n: formatQuantity(total) })}
            </span>
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-secondary">
              {savedAt ? (
                <CloudCheck size={14} strokeWidth={1.5} className="text-success" aria-hidden />
              ) : (
                <HardDrive size={14} strokeWidth={1.5} className="text-success" aria-hidden />
              )}
              {save.isPending ? t("doc.saving") : savedAt ? t("doc.savedAt", { t: savedAt }) : t("doc.saveLocal")}
            </span>
          </div>
          {canEdit ? (
            <Button size="lg" icon={Check} loading={submit.isPending} onClick={() => setDlg(unc.length ? "unc" : "finish")}>
              {t("doc.finish")}
            </Button>
          ) : null}
        </div>
      </div>

      <Modal
        open={dlg === "finish"}
        onClose={() => setDlg(null)}
        title={t("doc.dFinT")}
        primaryAction={{ label: t("doc.finish"), onClick: () => finish(false), loading: save.isPending || submit.isPending }}
        secondaryAction={{ label: t("doc.keep"), onClick: () => setDlg(null) }}
      >
        <p className="text-text-secondary">{t("doc.dFinD", { n: formatQuantity(total) })}</p>
      </Modal>
      <Modal
        open={dlg === "unc"}
        onClose={() => setDlg(null)}
        tone="danger"
        title={t("doc.dUncT", { n: formatQuantity(unc.length) })}
        primaryAction={{ label: t("doc.markZero"), onClick: () => finish(true), loading: save.isPending || submit.isPending }}
        secondaryAction={{ label: t("doc.backToCount"), onClick: () => setDlg(null) }}
      >
        <p className="mb-3 text-text-secondary">{t("doc.dUncD")}</p>
        <ul className="flex flex-col gap-1.5">
          {unc.slice(0, 6).map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-body">
              <CircleDashed size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
              {l.productName} · {l.batchNumber} · {l.zone.name}
            </li>
          ))}
          {unc.length > 6 ? <li className="text-caption text-text-secondary">+{formatQuantity(unc.length - 6)}</li> : null}
        </ul>
      </Modal>
      {dlg === "found" ? <AddFound doc={doc} onClose={() => setDlg(null)} /> : null}
    </div>
  );
}
