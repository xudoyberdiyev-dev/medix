"use client";

import { ArrowLeft, FileUp, Save, Upload } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { ForbiddenState } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import {
  autoMap,
  columnLetter,
  dataRows,
  mapFromProfile,
  mappingProblems,
  profileFromMap,
  records,
  type Mapping,
} from "@/features/products/import-model";
import { describeError } from "@/features/setup/form-error";
import { formatQuantity } from "@/lib/format";
import { PRICES_REFERENCE, readRefFile, saveRefProfile, useRefProfile, useUploadRef, type ImportFile } from "./api";
import { REF_FIELDS, toRefRows, type RefField } from "./model";

const MAX_BYTES = 10 * 1024 * 1024;

/** Eng koʻp toʻldirilgan katakli qator (birinchi 10 tadan) — sarlavha. */
function guessHeader(grid: string[][]): number {
  let best = 1;
  let bestN = 0;
  grid.slice(0, 10).forEach((r, i) => {
    const n = r.filter((c) => String(c ?? "").trim() !== "").length;
    if (n > bestN) {
      bestN = n;
      best = i + 1;
    }
  });
  return best;
}

/** O14: referent narxlar faylini yuklash — varaq, sarlavha qatori, ustunlarni moslash (profil saqlanadi) → solishtirish. */
export function RefUploadPage() {
  const t = useTranslations("referencePrices");
  const router = useRouter();
  const me = useMe();
  const profile = useRefProfile();
  const upload = useUploadRef();
  const [file, setFile] = useState<ImportFile | null>(null);
  const [sheet, setSheet] = useState(0);
  const [hdr, setHdr] = useState(1);
  const [map, setMap] = useState<Mapping<RefField>>({});
  const [reading, setReading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const grid = useMemo(() => file?.sheets[sheet]?.rows ?? [], [file, sheet]);
  const headers = useMemo(() => (grid[hdr - 1] ?? []).map((h) => String(h ?? "")), [grid, hdr]);
  const rows = useMemo(() => dataRows(grid, hdr), [grid, hdr]);
  const problems = mappingProblems(REF_FIELDS, map);
  if (me.data && !can(me.data, PRICES_REFERENCE)) return <ForbiddenState />;

  const applyMap = (g: string[][], h: number) => {
    const hs = (g[h - 1] ?? []).map((x) => String(x ?? ""));
    const fromProfile = profile.data ? mapFromProfile(profile.data.mapping, hs, REF_FIELDS) : {};
    setMap(Object.keys(fromProfile).length > 0 ? fromProfile : autoMap(REF_FIELDS, hs));
  };

  async function onFile(f: File | undefined) {
    if (!f) return;
    setErr(null);
    if (f.size > MAX_BYTES) {
      setErr(t("eSize"));
      return;
    }
    setReading(true);
    try {
      const r = await readRefFile(f);
      const first = Math.max(
        0,
        r.sheets.findIndex((s) => s.rows.length > 0),
      );
      const g = r.sheets[first]?.rows ?? [];
      const h = guessHeader(g);
      setFile(r);
      setSheet(first);
      setHdr(h);
      applyMap(g, h);
    } catch (x) {
      setErr(describeError(x).message ?? t("eRead"));
    } finally {
      setReading(false);
    }
  }

  async function onSaveProfile() {
    try {
      await saveRefProfile(t("profileName"), profileFromMap(map, headers));
      await profile.refetch();
      toast({ tone: "success", title: t("profileSaved") });
    } catch (x) {
      setErr(describeError(x).message ?? t("eRead"));
    }
  }

  async function onUpload() {
    if (!file) return;
    setErr(null);
    try {
      const res = await upload.mutateAsync({ fileName: file.fileName, rows: toRefRows(records(grid, hdr, map, {})) });
      toast({
        tone: "success",
        title: res.skipped.length > 0 ? t("uploadedSkipped", { n: res.rows, s: res.skipped.length }) : t("uploaded", { n: res.rows }),
      });
      router.push(`/reference-prices/${res.id}`);
    } catch (x) {
      setErr(describeError(x).message ?? t("eRead"));
    }
  }

  const headerOptions = [
    { value: "-1", label: t("notInFile") },
    ...headers.map((h, i) => ({ value: String(i), label: `${columnLetter(i)} · ${h.trim() || "—"}` })),
  ];
  const preview = rows.slice(0, 5);
  return (
    <div className="mx-auto flex w-full max-w-[960px] flex-col gap-4">
      <Link
        href="/reference-prices"
        className="inline-flex items-center gap-1.5 self-start text-table text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} strokeWidth={1.5} aria-hidden />
        {t("title")}
      </Link>
      <h1 className="text-title">{t("uploadTitle")}</h1>
      {err ? <Alert tone="danger" title={err} /> : null}
      <Card className="flex flex-col gap-3 p-5">
        <span className="font-medium">{t("step1")}</span>
        <label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-control border border-border px-4 py-2 hover:bg-background">
          <FileUp size={16} strokeWidth={1.5} aria-hidden />
          <span>{reading ? t("reading") : file ? file.fileName : t("chooseFile")}</span>
          <input
            type="file"
            data-testid="ref-file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            onChange={(e) => void onFile(e.target.files?.[0])}
          />
        </label>
        <span className="text-caption text-text-secondary">{t("fileHint")}</span>
      </Card>
      {file ? (
        <Card className="flex flex-col gap-4 p-5">
          <span className="font-medium">{t("step2")}</span>
          <div className="flex flex-wrap gap-3">
            {file.sheets.length > 1 ? (
              <Select
                className="w-64"
                label={t("sheet")}
                value={String(sheet)}
                options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                onChange={(v) => {
                  const i = Number(v ?? 0);
                  const g = file.sheets[i]?.rows ?? [];
                  const h = guessHeader(g);
                  setSheet(i);
                  setHdr(h);
                  applyMap(g, h);
                }}
              />
            ) : null}
            <TextField
              className="w-40"
              label={t("hdrRow")}
              value={String(hdr)}
              onChange={(v) => {
                const n = Math.max(1, Math.min(grid.length || 1, Number(v.replace(/\D/g, "")) || 1));
                setHdr(n);
                applyMap(grid, n);
              }}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {REF_FIELDS.map((f) => (
              <Select
                key={f.key}
                label={t(`f.${f.key}`)}
                required={f.req}
                value={String(map[f.key] ?? -1)}
                options={headerOptions}
                error={problems.missing.includes(f.key) ? t("eMissing") : problems.dup.includes(f.key) ? t("eDup") : undefined}
                onChange={(v) => setMap((m) => ({ ...m, [f.key]: Number(v ?? -1) }))}
              />
            ))}
          </div>
          <div className="overflow-x-auto rounded-control border border-border">
            <table className="w-full text-left text-table">
              <caption className="sr-only">{t("preview")}</caption>
              <thead className="bg-table-header text-text-secondary">
                <tr>
                  {REF_FIELDS.map((f) => (
                    <th key={f.key} className="px-3 py-2 font-medium">
                      {t(`f.${f.key}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r) => (
                  <tr key={r.i} className="border-t border-border">
                    {REF_FIELDS.map((f) => {
                      const ix = map[f.key] ?? -1;
                      return (
                        <td key={f.key} className="max-w-[220px] truncate px-3 py-2">
                          {ix >= 0 ? String(r.cells[ix] ?? "") : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-table text-text-secondary">{t("rowsN", { n: formatQuantity(rows.length) })}</span>
            <div className="flex gap-2">
              <Button variant="secondary" icon={Save} onClick={() => void onSaveProfile()}>
                {t("saveProfile")}
              </Button>
              <Button
                icon={Upload}
                loading={upload.isPending}
                disabled={problems.missing.length > 0 || problems.dup.length > 0 || rows.length === 0}
                onClick={() => void onUpload()}
              >
                {t("uploadCompare")}
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
