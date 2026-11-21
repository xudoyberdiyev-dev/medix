"use client";

import {
  Banknote,
  CircleAlert,
  CircleDashed,
  Download,
  FilePen,
  FileSpreadsheet,
  Package,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { toCsv } from "@/features/products/import-model";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney, formatQuantity } from "@/lib/format";

export type OpeningFilePreview = components["schemas"]["OpeningFilePreview"];
export type OpeningFileResult = components["schemas"]["OpeningFileResult"];
type Section = OpeningFilePreview["sections"][number]["section"];

export const MAX_FILE_MB = 10;

const SECTION_ICON: Record<Section, LucideIcon> = { GOODS: Package, CUSTOMER_DEBT: Users, SUPPLIER_DEBT: Truck, MONEY: Banknote };

const EXISTING = {
  NONE: { tone: "neutral", icon: CircleDashed },
  DRAFT: { tone: "warning", icon: FilePen },
  POSTED: { tone: "danger", icon: CircleAlert },
} as const;

function form(file: File) {
  const fd = new FormData();
  fd.append("file", file);
  return fd;
}

export async function previewOpeningFile(file: File, cutoffDate: string): Promise<OpeningFilePreview> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/opening-import/preview", {
      params: { query: { cutoffDate } },
      body: { file: file as unknown as string },
      bodySerializer: () => form(file),
    }),
  );
}

export async function applyOpeningFile(file: File, cutoffDate: string, post: boolean): Promise<OpeningFileResult> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/opening-import/apply", {
      params: { query: { cutoffDate, post } },
      body: { file: file as unknown as string },
      bodySerializer: () => form(file),
    }),
  );
}

/** Xatolar roʻyxati — Excelʼda ochiladigan CSV (varaq, qator, sabab). */
export function issuesCsv(issues: OpeningFilePreview["errors"], header: [string, string, string]): string {
  return toCsv([header, ...issues.map((e) => [e.sheet, e.row == null ? "" : String(e.row), e.message])]);
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * BQ1 — «SmartUp dan koʻchirish»: bitta Excel fayl (Tovar, Mijozlar qarzi, YB qarzi, Kassa va bank) → tekshirish (boʻlimlar,
 * filial/ombor guruhlari, xatolar) → qoralamalarni yaratish yoki hammasini oʻtkazish (tasdiq bilan).
 */
export function SmartUpImport({ canPost, onClose }: { canPost: boolean; onClose: () => void }) {
  const t = useTranslations("opening.smartup");
  const tt = useTranslations("opening");
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [date, setDate] = useState(formatIsoDate(todayTashkent()));
  const [preview, setPreview] = useState<OpeningFilePreview | null>(null);
  const [post, setPost] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const err = describeError(error);

  const iso = parseUzDate(date);

  function pick(f: File | null) {
    setPreview(null);
    setError(null);
    setLocal(null);
    setConfirming(false);
    if (f && f.size > MAX_FILE_MB * 1024 * 1024) {
      setFile(null);
      setLocal(t("tooLarge", { mb: MAX_FILE_MB }));
      return;
    }
    setFile(f);
  }

  async function check() {
    if (!file) return;
    if (!iso) return setLocal(t("dateInvalid"));
    if (iso > todayTashkent()) return setLocal(t("dateFuture"));
    setLocal(null);
    setPending(true);
    setError(null);
    try {
      setPreview(await previewOpeningFile(file, iso));
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  async function apply() {
    if (!file || !iso) return;
    setPending(true);
    setError(null);
    try {
      const r = await applyOpeningFile(file, iso, post);
      await qc.invalidateQueries({ queryKey: ["openings"] });
      await qc.invalidateQueries({ queryKey: ["opening-finance"] });
      await qc.invalidateQueries({ queryKey: ["stock"] });
      toast({
        tone: "success",
        title: r.posted ? t("donePosted") : t("doneDrafts"),
        description: t("doneDescription", { count: formatQuantity(r.documents.length) }),
      });
      onClose();
    } catch (e) {
      setError(e);
      setConfirming(false);
    } finally {
      setPending(false);
    }
  }

  const ready = preview?.canApply === true;
  const replaced = preview?.groups.filter((g) => g.existing === "DRAFT").length ?? 0;
  const step = !preview ? 0 : ready ? 2 : 1;
  const primary = confirming
    ? { label: t("confirmPost"), loading: pending, onClick: apply }
    : ready
      ? { label: post ? t("postAll") : t("createDrafts"), loading: pending, onClick: () => (post ? setConfirming(true) : apply()) }
      : { label: t("check"), loading: pending, disabled: !file, onClick: check };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("title")}
      primaryAction={primary}
      secondaryAction={confirming ? { label: t("back"), onClick: () => setConfirming(false) } : undefined}
    >
      <div className="flex flex-col gap-4">
        <Steps
          steps={[
            { label: t("step1"), state: step === 0 ? "cur" : "done" },
            { label: t("step2"), state: step === 0 ? "next" : step === 1 ? "fail" : "done" },
            { label: t("step3"), state: step === 2 ? "cur" : "next" },
          ]}
        />
        {confirming ? (
          <Alert tone="warning" title={t("confirmTitle", { count: formatQuantity(preview?.groups.length ?? 0) })}>
            {t("confirmText")}
          </Alert>
        ) : (
          <>
            <p className="text-text-secondary">{t("help")}</p>
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_200px]">
              <div className="flex flex-wrap items-center gap-3">
                <input
                  ref={input}
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="sr-only"
                  aria-label={t("choose")}
                  onChange={(e) => pick(e.target.files?.[0] ?? null)}
                />
                <Button variant="secondary" icon={FileSpreadsheet} onClick={() => input.current?.click()}>
                  {file ? t("chooseOther") : t("choose")}
                </Button>
                <span className="min-w-0 truncate text-text-secondary">{file ? file.name : t("noFile")}</span>
              </div>
              <TextField
                variant="date"
                label={t("cutoff")}
                value={date}
                onChange={(v) => (setDate(v), setPreview(null))}
                placeholder={tt("drawer.datePlaceholder")}
                required
              />
            </div>
            <a href="/api/opening-import/template" className="inline-flex w-fit items-center gap-1 text-primary hover:underline" download>
              <Download size={16} strokeWidth={1.5} aria-hidden />
              {t("template")}
            </a>
          </>
        )}
        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {preview && !confirming ? <PreviewResult preview={preview} replaced={replaced} /> : null}
        {ready && canPost && !confirming ? (
          <Checkbox label={t("postToggle")} description={t("postToggleHint")} checked={post} onChange={setPost} />
        ) : null}
      </div>
    </Modal>
  );
}

function PreviewResult({ preview, replaced }: { preview: OpeningFilePreview; replaced: number }) {
  const t = useTranslations("opening.smartup");
  const tt = useTranslations("opening");
  const header: [string, string, string] = [t("csvSheet"), t("csvRow"), t("csvMessage")];
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {preview.sections.map((s) => {
          const Icon = SECTION_ICON[s.section];
          return (
            <div key={s.section} className="flex items-start gap-2.5 rounded-card border border-border p-3">
              <span className="flex size-7 flex-none items-center justify-center rounded-md bg-primary-soft text-primary">
                <Icon size={16} strokeWidth={1.5} aria-hidden />
              </span>
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-[13px] font-semibold">{tt(`type.${s.section}`)}</span>
                <span className="text-caption text-text-secondary tabular">
                  {t("rows", { count: formatQuantity(s.rows) })}
                  {s.section === "GOODS" ? ` · ${t("qty", { count: formatQuantity(s.qty) })}` : ""}
                  {s.amount ? ` · ${formatMoney(s.amount)}` : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      {preview.groups.length ? (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-left text-body">
            <thead className="bg-table-header text-caption text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t("colType")}</th>
                <th className="px-3 py-2 font-medium">{t("colPlace")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("colRows")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("colSum")}</th>
                <th className="px-3 py-2 font-medium">{t("colExisting")}</th>
              </tr>
            </thead>
            <tbody>
              {preview.groups.map((g) => (
                <tr key={`${g.section}-${g.branchId}-${g.warehouseId ?? 0}`} className="border-t border-border">
                  <td className="px-3 py-2">{tt(`type.${g.section}`)}</td>
                  <td className="px-3 py-2">{g.warehouse ? `${g.branch} · ${g.warehouse}` : g.branch}</td>
                  <td className="px-3 py-2 text-right tabular">{formatQuantity(g.rows)}</td>
                  <td className="px-3 py-2 text-right tabular">{g.amount ? formatMoney(g.amount) : "—"}</td>
                  <td className="px-3 py-2">
                    <Badge tone={EXISTING[g.existing].tone} icon={EXISTING[g.existing].icon}>
                      {t(`existing.${g.existing}`)}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {preview.errors.length ? (
        <div className="flex flex-col gap-2">
          <Alert
            tone="danger"
            title={t("errorsTitle", { count: formatQuantity(preview.errors.length) + (preview.errorsTruncated ? "+" : "") })}
            action={
              <Button
                variant="tertiary"
                icon={Download}
                onClick={() =>
                  download(
                    `${preview.fileName.replace(/\.xlsx?$/i, "") || "boshlangich-qoldiq"}_xatolar.csv`,
                    issuesCsv(preview.errors, header),
                  )
                }
              >
                {t("downloadErrors")}
              </Button>
            }
          >
            {t("errorsHint")}
          </Alert>
          <IssueList issues={preview.errors} />
        </div>
      ) : (
        <Alert tone="success" title={t("ok")}>
          {replaced ? t("replaceHint", { count: formatQuantity(replaced) }) : null}
        </Alert>
      )}
      {preview.warnings.length ? (
        <div className="flex flex-col gap-2">
          <Alert tone="warning" title={t("warningsTitle", { count: formatQuantity(preview.warnings.length) })} />
          <IssueList issues={preview.warnings} />
        </div>
      ) : null}
    </div>
  );
}

function IssueList({ issues }: { issues: OpeningFilePreview["errors"] }) {
  const t = useTranslations("opening.smartup");
  return (
    <ul className="max-h-56 overflow-y-auto rounded-card border border-border">
      {issues.map((e, i) => (
        <li key={i} className="flex gap-3 border-b border-border px-3 py-2 last:border-b-0">
          <span className="w-52 shrink-0 text-text-secondary">
            {e.sheet}
            {e.row != null ? ` · ${t("row", { row: String(e.row) })}` : ""}
          </span>
          <span>{e.message}</span>
        </li>
      ))}
    </ul>
  );
}
