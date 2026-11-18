"use client";

import { ExternalLink } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/system-states";
import { Spinner } from "@/components/ui/spinner";
import { formatIsoDate } from "@/features/counterparties/api";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";
import { usePayment, useSupplierPayment } from "./api";

type Row = components["schemas"]["PaymentOverviewRow"];

/**
 * U5 (Toʻlovlar): toʻlovni roʻyxatdan chiqmasdan koʻrish — oʻngdan panel: turi, kontragent, sana, kassa/hisob, summa,
 * avans, qarzga taqsimot (hujjatlar) va «Toʻliq ochish». MT — mijozdan, YT — yetkazib beruvchiga.
 */
export function PaymentPreview({
  row,
  status,
  onClose,
  onOpen,
}: {
  row: Row;
  status: ReactNode;
  onClose: () => void;
  onOpen: (r: Row) => void;
}) {
  const t = useTranslations("payments");
  const tl = useTranslations("payments.list");
  const mt = usePayment(row.kind === "MT" ? row.id : null);
  const yt = useSupplierPayment(row.kind === "YT" ? row.id : null);
  const q = row.kind === "MT" ? mt : yt;
  const d = q.data;
  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      kind={row.kind === "YT" ? tl("out") : tl("in")}
      title={row.party}
      subtitle={row.number}
      status={status}
      actions={
        <Button icon={ExternalLink} onClick={() => onOpen(row)}>
          {tl("preview.open")}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
          <dt className="text-text-secondary">{tl("c.date")}</dt>
          <dd className="tabular-nums">{formatIsoDate(row.paymentDate)}</dd>
          <dt className="text-text-secondary">{tl("c.account")}</dt>
          <dd>{row.account}</dd>
          <dt className="text-text-secondary">{tl("c.amount")}</dt>
          <dd className="font-semibold tabular-nums">{formatMoney(row.amount)}</dd>
          <dt className="text-text-secondary">{tl("c.advance")}</dt>
          <dd className="tabular-nums">{row.advance ? formatMoney(row.advance) : "—"}</dd>
          <dt className="text-text-secondary">{tl("c.by")}</dt>
          <dd>{row.createdBy}</dd>
          {d?.note ? (
            <>
              <dt className="text-text-secondary">{tl("preview.note")}</dt>
              <dd className="whitespace-pre-line">{d.note}</dd>
            </>
          ) : null}
        </dl>
        <section aria-label={t("alloc.title")}>
          <h3 className="mb-2 text-subtitle font-semibold">{t("alloc.title")}</h3>
          {q.error ? (
            <ErrorState onRetry={() => q.refetch()} />
          ) : !d ? (
            <div className="flex justify-center py-6">
              <Spinner />
            </div>
          ) : d.allocations.length === 0 ? (
            <p className="text-text-secondary">{t("alloc.none")}</p>
          ) : (
            <ul className="divide-y divide-border rounded-card border border-border">
              {d.allocations.map((a) => (
                <li key={`${a.docType}-${a.docId}`} className="flex items-center justify-between gap-3 px-3 py-2">
                  <span className="font-mono text-text-secondary">{a.docNumber}</span>
                  <span className="tabular-nums">{formatMoney(a.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Drawer>
  );
}
