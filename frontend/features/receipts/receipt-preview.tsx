"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/system-states";
import { Spinner } from "@/components/ui/spinner";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useReceipt } from "./api";
import { ReceiptStatusBadge, day } from "./receipts-page";

/** Panelda koʻrsatiladigan qatorlar soni — qolgani «Toʻliq ochish»da. */
const PREVIEW_LINES = 8;

/**
 * U5 (Kirim): kirimni roʻyxatdan chiqmasdan koʻrish — oʻngdan panel: holat, yetkazib beruvchi, yuk xati, ombor,
 * toʻlov, summa (narx koʻrinadiganlarga), qatorlar (partiya, muddat, joy) va «Toʻliq ochish».
 */
export function ReceiptPreview({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (id: number) => void }) {
  const t = useTranslations("receipts");
  const r = useReceipt(id);
  const d = r.data;
  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      kind={t("preview.kind")}
      title={d ? d.supplier : t("preview.loading")}
      subtitle={d?.number}
      status={d ? <ReceiptStatusBadge status={d.status} /> : undefined}
      actions={
        <Button icon={ExternalLink} onClick={() => onOpen(id)}>
          {t("preview.open")}
        </Button>
      }
    >
      {r.error ? (
        <ErrorState onRetry={() => r.refetch()} />
      ) : !d ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-text-secondary">{t("list.col.date")}</dt>
            <dd className="tabular-nums">{day(d.receiptDate)}</dd>
            <dt className="text-text-secondary">{t("list.col.invoice")}</dt>
            <dd className="tabular-nums">
              {d.invoiceNumber ?? "—"}
              {d.invoiceDate ? <span className="text-text-secondary"> · {day(d.invoiceDate)}</span> : null}
            </dd>
            <dt className="text-text-secondary">{t("list.col.warehouse")}</dt>
            <dd>{d.warehouse}</dd>
            <dt className="text-text-secondary">{t("list.col.due")}</dt>
            <dd className="tabular-nums">{d.dueDate ? day(d.dueDate) : "—"}</dd>
            {d.note ? (
              <>
                <dt className="text-text-secondary">{t("preview.note")}</dt>
                <dd className="whitespace-pre-line">{d.note}</dd>
              </>
            ) : null}
          </dl>
          <section aria-label={t("preview.lines")}>
            <h3 className="mb-2 text-subtitle font-semibold">
              {t("preview.lines")} <span className="font-normal text-text-secondary tabular-nums">{formatQuantity(d.lines.length)}</span>
            </h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {d.lines.slice(0, PREVIEW_LINES).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.productName}</span>
                    <span className="text-caption text-text-secondary tabular-nums">
                      {[l.batchNumber, l.expiryDate ? day(l.expiryDate) : null, l.zone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right tabular-nums">
                    {formatQuantity(l.qty)}
                    {d.pricesVisible && l.price ? (
                      <span className="block text-caption text-text-secondary">{formatMoney(l.price)}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {d.lines.length > PREVIEW_LINES ? (
              <p className="mt-1.5 text-caption text-text-secondary">{t("preview.moreLines", { n: d.lines.length - PREVIEW_LINES })}</p>
            ) : null}
          </section>
          <dl className="flex flex-col gap-1 rounded-card bg-table-header px-3 py-2.5">
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("list.col.qty")}</dt>
              <dd className="tabular-nums">{formatQuantity(d.totalQty)}</dd>
            </div>
            {d.pricesVisible && d.amount ? (
              <div className="flex justify-between font-semibold">
                <dt>{t("list.col.amount")}</dt>
                <dd className="tabular-nums">{formatMoney(d.amount)}</dd>
              </div>
            ) : null}
          </dl>
        </div>
      )}
    </Drawer>
  );
}
