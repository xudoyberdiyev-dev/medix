"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
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

type ImportResult = components["schemas"]["ImportResult"];

async function upload(file: File, apply: boolean): Promise<ImportResult> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/products/import", {
      params: { query: { apply } },
      // Fayl multipart sifatida yuboriladi; sxemadagi `file` maydoni — ikkilik.
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

/** Excelʼdan import: avval tekshiriladi (hech narsa yozilmaydi), xato boʻlmasa — «Import qilish». */
export function ImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("products.import");
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const err = describeError(error);
  const ready = result !== null && result.errors.length === 0 && result.created > 0;

  async function run(apply: boolean) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const r = await upload(file, apply);
      setResult(r);
      if (r.applied) {
        toast({ tone: "success", title: t("done"), description: t("doneDescription", { count: formatQuantity(r.created) }) });
        await qc.invalidateQueries({ queryKey: ["products"] });
        await qc.invalidateQueries({ queryKey: ["dictionaries"] });
        onClose();
      }
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("title")}
      primaryAction={
        ready
          ? { label: t("apply", { count: formatQuantity(result.created) }), loading: pending, onClick: () => run(true) }
          : { label: t("check"), loading: pending, disabled: !file, onClick: () => run(false) }
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">{t("intro")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => (setFile(e.target.files?.[0] ?? null), setResult(null), setError(null))}
          />
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => input.current?.click()}>
            {file ? t("chooseOther") : t("choose")}
          </Button>
          <span className="text-text-secondary">{file ? file.name : t("noFile")}</span>
          <a href="/api/products/import-template" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" download>
            <Download size={16} strokeWidth={1.5} aria-hidden />
            {t("template")}
          </a>
        </div>
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {result ? (
          result.errors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Alert tone="danger" title={t("errorsTitle", { count: formatQuantity(result.errors.length) })}>
                {t("errorsHint")}
              </Alert>
              <ul className="max-h-64 overflow-y-auto rounded-card border border-border">
                {result.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`} className="flex gap-3 border-b border-border px-3 py-2 last:border-b-0">
                    <span className="w-20 shrink-0 font-mono text-text-secondary">{t("row", { row: e.row })}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert tone="success" title={t("ok", { count: formatQuantity(result.created) })}>
              {result.createdManufacturers.length > 0 ? t("newManufacturers", { list: result.createdManufacturers.join(", ") }) : ""}
              {result.createdCategories.length > 0 ? t("newCategories", { list: result.createdCategories.join(", ") }) : ""}
            </Alert>
          )
        ) : null}
      </div>
    </Modal>
  );
}
