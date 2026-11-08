"use client";

import type { UseQueryResult } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { formatIsoDate } from "@/features/counterparties/api";
import { formatMoney } from "@/lib/format";
import { fifoPreview, type OpenDocs } from "./api";

/** Ochiq qarzlar jadvali (MT va YT): avtomatik taqsimot koʻrinishi (eng eski qarzdan) yoki qoʻlda kiritish. */
export function OpenDocsSection(props: {
  open: UseQueryResult<OpenDocs>;
  manual: boolean;
  setManual: (v: boolean) => void;
  alloc: Record<string, string>;
  setAlloc: (f: (m: Record<string, string>) => Record<string, string>) => void;
  editable: boolean;
  amount: string;
}) {
  const t = useTranslations("payments.openDocs");
  const { open, manual, setManual, alloc, setAlloc, editable } = props;
  const docs = open.data?.docs ?? [];
  const preview = fifoPreview(docs, /^\d+(\.\d+)?$/.test(props.amount) ? props.amount : "0");
  const previewOf = new Map(preview.parts.map((p) => [p.key, p.amount]));
  return (
    <section aria-label={t("title")}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-subtitle">{t("title")}</h2>
        {open.data ? (
          <span className="text-caption text-text-secondary">
            {t.rich("summary", {
              debt: formatMoney(open.data.debt),
              advance: formatMoney(open.data.advance),
              num: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </span>
        ) : null}
      </div>
      {open.error ? (
        <ErrorState onRetry={() => open.refetch()} />
      ) : open.isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : docs.length === 0 ? (
        <p className="text-text-secondary">{t("empty")}</p>
      ) : (
        <>
          <Checkbox label={t("manual")} checked={manual} onChange={(v) => setManual(v)} disabled={!editable} className="mb-2" />
          <table className="w-full text-left">
            <thead className="text-caption text-text-secondary">
              <tr>
                <th className="py-1 font-normal">{t("col.document")}</th>
                <th className="py-1 font-normal">{t("col.date")}</th>
                <th className="py-1 font-normal">{t("col.due")}</th>
                <th className="py-1 text-right font-normal">{t("col.open")}</th>
                <th className="py-1 text-right font-normal">{t("col.fromPayment")}</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const key = `${d.docType}:${d.docId}`;
                return (
                  <tr key={key} className="border-t border-border">
                    <td className="py-2 font-mono">{d.docNumber}</td>
                    <td className="py-2">{formatIsoDate(d.date)}</td>
                    <td className={d.overdueDays > 0 ? "py-2 text-danger" : "py-2"}>
                      {d.dueDate ? formatIsoDate(d.dueDate) : "—"}
                      {d.overdueDays > 0 ? ` · ${t("overdueDays", { count: d.overdueDays })}` : ""}
                    </td>
                    <td className="py-2 text-right font-mono">{formatMoney(d.open)}</td>
                    <td className="py-2 text-right">
                      {manual ? (
                        <TextField
                          label={t("allocLabel", { number: d.docNumber })}
                          variant="amount"
                          value={alloc[key] ?? ""}
                          onChange={(v) => setAlloc((m) => ({ ...m, [key]: v }))}
                          className="ml-auto w-36 [&>span:first-child]:sr-only"
                        />
                      ) : (
                        <span className="font-mono">{previewOf.has(key) ? formatMoney(previewOf.get(key) as string) : "—"}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!manual ? (
            <p className="mt-2 text-caption text-text-secondary">
              {t.rich("auto", {
                advance: formatMoney(preview.advance),
                num: (chunks) => <span className="font-mono">{chunks}</span>,
              })}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
