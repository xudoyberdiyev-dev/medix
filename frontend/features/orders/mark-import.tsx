"use client";

import { useQueryClient } from "@tanstack/react-query";
import { CircleCheck, CircleX, Download, FileSpreadsheet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatQuantity } from "@/lib/format";

export type MarkImportResult = components["schemas"]["MarkImportResult"];

/** Kodlar faylini yuborish: apply=false — oldindan koʻrish, apply=true — mos kelganlarini qabul qilish (O5). */
export async function importMarkCodes(orderId: number, file: File, apply: boolean): Promise<MarkImportResult> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/marking/orders/{id}/import", {
      params: { path: { id: orderId }, query: { apply } },
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

/** Koʻrsatish uchun kodni qisqartirish (GS ajratgichi «␝» koʻrinishida). */
export function shortCode(code: string, max = 48): string {
  const c = code.replace(/\u001d/g, "␝");
  return c.length > max ? `${c.slice(0, max - 1)}…` : c;
}

/**
 * Markirovka — tayyor Excel/CSV fayl bilan yakunlash (egasi 13.11, O5): fayl → oldindan koʻrish (har qator: qabul / sabab)
 * → «Qabul qilish». Natija qoʻlda skanerlash bilan bir xil; qolganlari qoʻlda skanerlanadi.
 */
export function MarkImportButton({ orderId }: { orderId: number }) {
  const t = useTranslations("orders.markImport");
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" icon={FileSpreadsheet} onClick={() => setOpen(true)}>
        {t("open")}
      </Button>
      {open ? <MarkImportDialog orderId={orderId} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MarkImportDialog({ orderId, onClose }: { orderId: number; onClose: () => void }) {
  const t = useTranslations("orders.markImport");
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<MarkImportResult | null>(null);
  const [busy, setBusy] = useState<"check" | "apply" | null>(null);
  const [error, setError] = useState<unknown>(null);
  const err = describeError(error);

  async function check(f: File) {
    setFile(f);
    setPreview(null);
    setError(null);
    setBusy("check");
    try {
      setPreview(await importMarkCodes(orderId, f, false));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!file || !preview?.accepted) return;
    setBusy("apply");
    setError(null);
    try {
      const r = await importMarkCodes(orderId, file, true);
      if (r.work) qc.setQueryData(["marking", "mine"], r.work);
      await qc.invalidateQueries({ queryKey: ["marking"] });
      toast({
        tone: r.rejected ? "warning" : "success",
        title: t("done", { n: formatQuantity(r.accepted) }),
        description: r.rejected ? t("doneRest", { n: formatQuantity(r.rejected) }) : undefined,
      });
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={t("title")}
      primaryAction={{
        label: preview ? t("apply", { n: formatQuantity(preview.accepted) }) : t("apply", { n: 0 }),
        onClick: () => void apply(),
        loading: busy === "apply",
        disabled: !preview?.accepted || busy !== null,
      }}
      secondaryAction={{ label: t("back"), onClick: onClose }}
    >
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">{t("about")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,.csv,.txt"
            className="sr-only"
            aria-label={t("pick")}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void check(f);
            }}
          />
          <Button icon={FileSpreadsheet} loading={busy === "check"} onClick={() => fileRef.current?.click()}>
            {file ? t("pickOther") : t("pick")}
          </Button>
          <a
            href="/api/marking/import-template"
            download
            className="inline-flex items-center gap-1.5 rounded-control px-2 py-1 text-primary hover:bg-primary-soft"
          >
            <Download size={16} strokeWidth={1.5} aria-hidden /> {t("template")}
          </a>
          {file ? <span className="truncate text-caption text-text-secondary">{file.name}</span> : null}
        </div>
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {preview ? (
          <>
            <div className="flex flex-wrap gap-3" aria-live="polite">
              <span className="inline-flex items-center gap-1.5 text-success">
                <CircleCheck size={16} strokeWidth={1.5} aria-hidden /> {t("ok", { n: formatQuantity(preview.accepted) })}
              </span>
              <span
                className={
                  preview.rejected ? "inline-flex items-center gap-1.5 text-danger" : "inline-flex items-center gap-1.5 text-text-secondary"
                }
              >
                <CircleX size={16} strokeWidth={1.5} aria-hidden /> {t("bad", { n: formatQuantity(preview.rejected) })}
              </span>
              <span className="text-text-secondary">{t("total", { n: formatQuantity(preview.total) })}</span>
            </div>
            {preview.rejected ? <Alert tone="info" title={t("partial")} /> : null}
            <div className="max-h-80 overflow-y-auto rounded-card border border-border">
              <table className="w-full text-table">
                <thead className="sticky top-0 bg-table-header text-left text-text-secondary">
                  <tr>
                    <th className="w-14 px-3 py-2 font-medium">{t("colRow")}</th>
                    <th className="px-3 py-2 font-medium">{t("colCode")}</th>
                    <th className="px-3 py-2 font-medium">{t("colResult")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r) => (
                    <tr key={r.row} className="border-t border-border align-top">
                      <td className="px-3 py-2 tabular-nums text-text-secondary">{r.row}</td>
                      <td className="max-w-0 px-3 py-2">
                        <span className="block truncate font-mono text-caption" title={r.code}>
                          {shortCode(r.code)}
                        </span>
                      </td>
                      <td className="px-3 py-2">
                        {r.ok ? (
                          <span className="inline-flex items-center gap-1.5 text-success">
                            <CircleCheck size={14} strokeWidth={1.5} aria-hidden /> {r.productName ?? t("accepted")}
                          </span>
                        ) : (
                          <span className="inline-flex items-start gap-1.5 text-danger">
                            <CircleX size={14} strokeWidth={1.5} className="mt-0.5 shrink-0" aria-hidden /> {r.error ?? r.errorCode}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
