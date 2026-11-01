"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Download, FileSpreadsheet } from "lucide-react";
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

/** Excel'dan import: avval tekshiriladi (hech narsa yozilmaydi), xato boʻlmasa — «Import qilish». */
export function ImportDialog({ onClose }: { onClose: () => void }) {
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
        toast({ tone: "success", title: "Import yakunlandi", description: `${formatQuantity(r.created)} ta mahsulot qoʻshildi` });
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
      title="Mahsulotlarni Excel'dan import qilish"
      primaryAction={
        ready
          ? { label: `${formatQuantity(result.created)} ta mahsulotni import qilish`, loading: pending, onClick: () => run(true) }
          : { label: "Faylni tekshirish", loading: pending, disabled: !file, onClick: () => run(false) }
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">
          Shablon ustunlari: Nomi va Birlik — majburiy; Kod (8 raqam) berilsa saqlanadi, boʻlmasa avtomatik beriladi. Yangi ishlab
          chiqaruvchi va kategoriyalar avtomatik qoʻshiladi. Bitta xato qator boʻlsa — hech narsa yozilmaydi.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={input}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={(e) => (setFile(e.target.files?.[0] ?? null), setResult(null), setError(null))}
          />
          <Button variant="secondary" icon={FileSpreadsheet} onClick={() => input.current?.click()}>
            {file ? "Boshqa fayl tanlash" : "Fayl tanlash"}
          </Button>
          <span className="text-text-secondary">{file ? file.name : "Fayl tanlanmagan"}</span>
          <a href="/api/products/import-template" className="ml-auto inline-flex items-center gap-1 text-primary hover:underline" download>
            <Download size={16} strokeWidth={1.5} aria-hidden />
            Shablonni yuklab olish
          </a>
        </div>
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {result ? (
          result.errors.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Alert tone="danger" title={`${formatQuantity(result.errors.length)} ta qatorda xato — hech narsa yozilmadi`}>
                Xatolarni faylda tuzatib, qayta tekshiring.
              </Alert>
              <ul className="max-h-64 overflow-y-auto rounded-card border border-border">
                {result.errors.map((e) => (
                  <li key={`${e.row}-${e.message}`} className="flex gap-3 border-b border-border px-3 py-2 last:border-b-0">
                    <span className="w-20 shrink-0 font-mono text-text-secondary">{e.row}-qator</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert tone="success" title={`Fayl toʻgʻri: ${formatQuantity(result.created)} ta mahsulot qoʻshishga tayyor`}>
              {result.createdManufacturers.length > 0 ? `Yangi ishlab chiqaruvchilar: ${result.createdManufacturers.join(", ")}. ` : ""}
              {result.createdCategories.length > 0 ? `Yangi kategoriyalar: ${result.createdCategories.join(", ")}.` : ""}
            </Alert>
          )
        ) : null}
      </div>
    </Modal>
  );
}
