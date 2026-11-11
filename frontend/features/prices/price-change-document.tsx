"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Ban, Check, CircleCheck, CircleX, Clock, Lock, Printer, X } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { todayTashkent } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useBranchList } from "@/features/organization/api";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PRICE_BELOW, PRICE_CREATE, isFuture, useCancel, usePriceChange, useReject, type PriceChangeDetail } from "./api";
import { ApproveDialog, PriceChangeDrawer } from "./price-change-drawer";
import { StatusBadge } from "./prices-page";
import { toCents } from "./price-set";

type Line = PriceChangeDetail["lines"][number];

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const at = (iso?: string | null) => (iso ? formatDateTime(new Date(iso)) : "—");

/** Tannarxdan past: yangi narx tannarxdan kichik (pul — tiyinda, BigInt). */
export function isBelowCost(l: Pick<Line, "newPrice" | "cost">): boolean {
  if (!l.cost) return false;
  const p = toCents(l.newPrice);
  const c = toCents(l.cost);
  return p !== null && c !== null && p < c;
}

/**
 * NO hujjati — toʻliq sahifa (prototip `Prices` → «NO hujjati»): non-krosh «Narx oʻzgarishlari / raqam», sarlavha + holat,
 * harakatlar (Chop etish; tasdiqda — Rad etish / Tasdiqlash), holat bannerlari, maʼlumot kartasi (Narx turi, Filial, Kuchga kirish,
 * Manba, Tuzdi, Yaratilgan, Tasdiqladi, Izoh) va qatorlar jadvali (№, Kod, Mahsulot, Partiya, Eski/Yangi narx, Oʻzgarish,
 * Tannarx — faqat ruxsat bilan). Qoralama — tahrirlash oynasida ochiladi.
 */
export function PriceChangeDocumentPage({ id }: { id: number }) {
  const router = useRouter();
  const me = useMe();
  const doc = usePriceChange(id);
  const branches = useBranchList();
  const back = "/prices?tab=documents";
  if (doc.error) return <ErrorState error={doc.error} onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-busy>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  const d = doc.data;
  if (d.status === "DRAFT")
    return (
      <PriceChangeDrawer
        id={d.id}
        branchId={d.branchId}
        canSet={can(me.data, PRICE_CREATE)}
        onClose={() => router.push(back)}
        onCreated={() => undefined}
      />
    );
  const branchName = (branches.data ?? []).find((b) => b.id === d.branchId)?.name ?? "—";
  return <DocumentView key={`${d.id}-${d.status}`} d={d} branchName={branchName} back={back} />;
}

function DocumentView({ d, branchName, back }: { d: PriceChangeDetail; branchName: string; back: string }) {
  const t = useTranslations("prices.doc");
  const tc = useTranslations("prices.drawer");
  const me = useMe();
  const canBelow = can(me.data, PRICE_BELOW);
  const canSet = can(me.data, PRICE_CREATE);
  const reject = useReject();
  const cancel = useCancel();
  const [dialog, setDialog] = useState<"approve" | "reject" | "cancel" | null>(null);
  const showCost = d.lines.some((l) => l.cost != null);
  const types = [...new Set(d.lines.map((l) => l.priceType))];
  const approver = d.status === "APPROVED" ? (d.decidedBy ?? d.createdBy) : null;

  const banners: { tone: "success" | "warning" | "danger" | "info"; icon: typeof Clock; text: string }[] = [];
  if (d.status === "PENDING_APPROVAL") {
    banners.push({ tone: "warning", icon: Clock, text: t("bnPending", { at: at(d.submittedAt ?? d.createdAt), who: d.createdBy }) });
    if (!canBelow) banners.push({ tone: "info", icon: Lock, text: t("bnLock") });
  }
  if (d.status === "APPROVED") {
    banners.push({
      tone: "success",
      icon: CircleCheck,
      text: t("bnPosted", { at: at(d.decidedAt ?? d.submittedAt ?? d.createdAt), who: approver ?? "—", date: day(d.effectiveFrom) }),
    });
    if (isFuture(d.effectiveFrom, todayTashkent()))
      banners.push({ tone: "info", icon: Clock, text: t("bnFuture", { date: day(d.effectiveFrom) }) });
  }
  if (d.status === "REJECTED")
    banners.push({
      tone: "danger",
      icon: CircleX,
      text: t("bnRejected", { at: at(d.decidedAt), who: d.decidedBy ?? "—", reason: d.decisionReason ?? "—" }),
    });
  if (d.status === "CANCELLED")
    banners.push({
      tone: "info",
      icon: Ban,
      text: t("bnCancelled", { at: at(d.decidedAt), who: d.decidedBy ?? "—", reason: d.decisionReason ?? "—" }),
    });

  const info: { k: string; v: React.ReactNode }[] = [
    { k: t("iType"), v: types.length ? types.join(", ") : "—" },
    { k: t("iBranch"), v: branchName },
    { k: t("iEffective"), v: day(d.effectiveFrom) },
    {
      k: t("iSource"),
      v:
        d.receiptId && d.receiptNumber ? (
          <>
            {t("srcReceipt")} ·{" "}
            <Link href={`/receipts/${d.receiptId}`} className="text-primary underline underline-offset-2 hover:text-primary-hover">
              {d.receiptNumber}
            </Link>
          </>
        ) : (
          t("srcSet")
        ),
    },
    { k: t("iBy"), v: d.createdBy },
    { k: t("iCreated"), v: at(d.createdAt) },
    { k: t("iApprover"), v: approver ?? "—" },
    { k: t("iNote"), v: d.note || "—" },
  ];

  const pct = (l: Line) => (l.changePercent == null ? null : Number(l.changePercent));
  const columns: TableColumn<Line & { n: number }>[] = [
    { key: "n", title: t("lNo"), width: 56, render: (l) => <span className="text-text-secondary">{l.n}</span> },
    { key: "productCode", title: t("lCode"), mono: true, width: 100 },
    {
      key: "productName",
      title: t("lProduct"),
      wrap: true,
      render: (l) => (
        <span className="flex flex-col">
          <span className="font-medium">{l.productName}</span>
          {l.manufacturer ? <span className="text-caption text-text-secondary">{l.manufacturer}</span> : null}
        </span>
      ),
    },
    ...(types.length > 1 ? [{ key: "priceType", title: t("iType"), width: 140 } as TableColumn<Line & { n: number }>] : []),
    { key: "batchNumber", title: t("lBatch"), mono: true, width: 120, render: (l) => l.batchNumber ?? "—" },
    {
      key: "oldPrice",
      title: t("lOld"),
      align: "right",
      width: 130,
      render: (l) => <span className="text-text-secondary tabular-nums">{l.oldPrice ? formatMoney(l.oldPrice) : "—"}</span>,
    },
    {
      key: "newPrice",
      title: t("lNew"),
      align: "right",
      width: 130,
      render: (l) => <span className={cn("font-semibold tabular-nums", isBelowCost(l) && "text-danger")}>{formatMoney(l.newPrice)}</span>,
    },
    {
      key: "changePercent",
      title: t("lChange"),
      align: "right",
      width: 96,
      render: (l) => {
        const p = pct(l);
        return (
          <span className={cn("tabular-nums", p == null || p === 0 ? "text-text-secondary" : p > 0 ? "text-success" : "text-danger")}>
            {p == null ? "—" : `${p > 0 ? "+" : ""}${p.toLocaleString("uz-UZ")}%`}
          </span>
        );
      },
    },
    ...(showCost
      ? [
          {
            key: "cost",
            title: t("lCost"),
            align: "right",
            width: 150,
            render: (l: Line) => (
              <span className={cn("tabular-nums", isBelowCost(l) ? "text-danger" : "text-text-secondary")}>
                {l.cost ? formatMoney(l.cost) : "—"}
              </span>
            ),
          } as TableColumn<Line & { n: number }>,
        ]
      : []),
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentHeader
        parent={{ label: t("parent"), href: back }}
        crumb={d.number}
        crumbMono
        title={t("title", { number: d.number })}
        status={<StatusBadge status={d.status} />}
        actions={
          <>
            <Button variant="secondary" icon={Printer} onClick={() => window.open(`/api/price-changes/${d.id}/pdf`, "_blank", "noopener")}>
              {t("print")}
            </Button>
            {d.status === "APPROVED" && canSet && isFuture(d.effectiveFrom, todayTashkent()) ? (
              <Button variant="secondary" className="text-danger" icon={Ban} onClick={() => (cancel.reset(), setDialog("cancel"))}>
                {t("cancel")}
              </Button>
            ) : null}
            {d.status === "PENDING_APPROVAL" && canSet && !canBelow ? (
              <Button variant="secondary" icon={X} onClick={() => (cancel.reset(), setDialog("cancel"))}>
                {t("cancel")}
              </Button>
            ) : null}
            {d.status === "PENDING_APPROVAL" && canBelow ? (
              <>
                <Button variant="secondary" className="text-danger" icon={X} onClick={() => (reject.reset(), setDialog("reject"))}>
                  {t("reject")}
                </Button>
                <Button icon={Check} onClick={() => setDialog("approve")}>
                  {t("approve")}
                </Button>
              </>
            ) : null}
          </>
        }
      />
      {banners.map((b) => (
        <Alert key={b.text} tone={b.tone} icon={b.icon} title={b.text} />
      ))}
      <section className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-5 gap-y-3 rounded-card border border-border bg-surface px-5 py-4">
        {info.map((i) => (
          <div key={i.k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-caption text-text-secondary">{i.k}</span>
            <span className="font-medium [overflow-wrap:anywhere]">{i.v}</span>
          </div>
        ))}
      </section>
      <Table
        caption={t("caption", { number: d.number })}
        columns={columns}
        rows={d.lines.map((l, i) => ({ ...l, n: i + 1 }))}
        rowKey={(l) => String(l.id)}
      />
      <div className="h-8" />
      {dialog === "approve" ? <ApproveDialog id={d.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "reject" || dialog === "cancel" ? (
        <DeactivateDialog
          title={dialog === "reject" ? t("rejectTitle", { number: d.number }) : t("cancelTitle", { number: d.number })}
          consequence={t("consequence")}
          actionLabel={dialog === "reject" ? t("reject") : t("cancel")}
          pending={dialog === "reject" ? reject.isPending : cancel.isPending}
          error={dialog === "reject" ? reject.error : cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            (dialog === "reject" ? reject : cancel).mutate(
              { id: d.id, reason },
              {
                onSuccess: () => (
                  toast({
                    tone: "success",
                    title: dialog === "reject" ? tc("rejected") : tc("cancelled"),
                    description: d.number,
                  }),
                  setDialog(null)
                ),
              },
            )
          }
        />
      ) : null}
    </div>
  );
}
