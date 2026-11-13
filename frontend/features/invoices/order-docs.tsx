"use client";

import { Download, FileText } from "lucide-react";
import { useTranslations } from "next-intl";
import { Spinner } from "@/components/ui/spinner";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { formatIsoDate } from "@/features/counterparties/api";
import { formatDateTime, formatMoney } from "@/lib/format";
import { invoiceFileUrl, useOrderInvoiceTask } from "./api";
import { InvoiceStatusBadge } from "./invoices-page";

/** Buyurtma kartochkasi «Hujjatlar» (O10d): faktura vazifasi holati, e-faktura raqami va yuklangan fayllar. */
export function OrderInvoiceDocs({ orderId }: { orderId: number }) {
  const t = useTranslations("invoices");
  const q = useOrderInvoiceTask(orderId, true);
  if (q.isPending)
    return (
      <div className="flex justify-center rounded-card border border-border bg-surface p-5">
        <Spinner />
      </div>
    );
  if (q.error) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  if (!q.data)
    return (
      <div className="rounded-card border border-border bg-surface">
        <EmptyState icon={FileText} title={t("emptyTitle")} description={t("emptyDescription")} />
      </div>
    );
  const { task, files } = q.data;
  return (
    <section className="rounded-card border border-border bg-surface px-5 py-4" data-testid="order-invoice-docs">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">{t("docs.title")}</h3>
        <InvoiceStatusBadge status={task.status} />
      </div>
      <dl className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 text-[13px]">
        <div>
          <dt className="text-text-secondary">{t("col.invoice")}</dt>
          <dd className="font-mono">{task.invoiceNumber ?? t("noInvoice")}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">{t("efNumber")}</dt>
          <dd className="font-mono">{task.efakturaNumber ? `${task.efakturaNumber} · ${formatIsoDate(task.efakturaDate)}` : "—"}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">{t("col.total")}</dt>
          <dd className="tabular-nums">{formatMoney(task.total)}</dd>
        </div>
        <div>
          <dt className="text-text-secondary">{t("col.codes")}</dt>
          <dd className="tabular-nums">
            {task.codes} · {t(`owner.${task.codesOwner}`)}
          </dd>
        </div>
      </dl>
      <h4 className="mt-4 mb-2 text-caption text-text-secondary">{t("docs.files")}</h4>
      {files.length === 0 ? (
        <p className="text-text-secondary">{t("docs.noFiles")}</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {files.map((f) => (
            <li key={f.id} className="flex min-h-11 items-center gap-3 py-2">
              <span className="w-24 shrink-0 text-caption text-text-secondary">{t(`docs.kind.${f.kind}`)}</span>
              <span className="min-w-0 flex-1 truncate">{f.fileName}</span>
              <span className="hidden text-caption text-text-secondary md:inline">
                {f.createdBy} · {formatDateTime(new Date(f.createdAt))}
              </span>
              <a
                href={invoiceFileUrl(f.id)}
                className="inline-flex items-center gap-1.5 text-primary hover:underline"
                aria-label={`${t(`docs.kind.${f.kind}`)}: ${f.fileName}`}
              >
                <Download size={16} strokeWidth={1.5} aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
