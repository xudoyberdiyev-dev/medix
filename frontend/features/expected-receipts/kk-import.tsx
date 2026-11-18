"use client";

import { CircleAlert, CircleCheck, CircleSlash, FileSpreadsheet, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Select, type SelectOption } from "@/components/ui/select";
import { Table, type TableColumn } from "@/components/ui/table";
import { autoMap, type Mapping } from "@/features/products/import-model";
import { guessHeader } from "@/features/reference-prices/model";
import { describeError } from "@/features/setup/form-error";
import { formatMoney, formatQuantity } from "@/lib/format";
import { importKkLines, readKkImportFile, type KkImportFile, type KkImportLine } from "./api";
import { importable, importRows, importTone, knownProblems, KK_IMPORT_FIELDS, type KkImportField } from "./import-model";

const MAX_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 500;

/** Qoʻshiladigan qator — KK shakli oʻz formatiga oʻgiradi. */
export type ImportedKkLine = KkImportLine & { productId: number; productName: string; productCode: string; qty: number };

/** KK qatorlarini YB faylidan yuklash (O15): fayl → ustunlarni moslash → tekshirish → qoʻshish. Hech narsa saqlanmaydi. */
export function KkImportModal({
  open,
  onClose,
  onAdd,
  prices,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (lines: ImportedKkLine[]) => void;
  prices: boolean;
}) {
  const t = useTranslations("expectedReceipts.import");
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<KkImportFile | null>(null);
  const [sheet, setSheet] = useState(0);
  const [hdr, setHdr] = useState(1);
  const [map, setMap] = useState<Mapping<KkImportField> | null>(null);
  const [result, setResult] = useState<KkImportLine[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const grid = useMemo(() => file?.sheets[sheet]?.rows ?? [], [file, sheet]);
  const headers = useMemo(() => (grid[hdr - 1] ?? []).map((h) => String(h ?? "")), [grid, hdr]);
  const effective: Mapping<KkImportField> = map ?? autoMap(KK_IMPORT_FIELDS, headers);
  const fields = KK_IMPORT_FIELDS.filter((f) => prices || f.key !== "price");
  const colOptions: SelectOption[] = headers.map((h, i) => ({ value: String(i), label: h.trim() || t("colN", { n: i + 1 }) }));
  const ready = (result ?? []).filter(importable) as ImportedKkLine[];

  function reset() {
    setFile(null);
    setResult(null);
    setMap(null);
    setErr("");
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext)) return setErr(t("e.type"));
    if (f.size > MAX_BYTES) return setErr(t("e.size"));
    setErr("");
    setBusy(true);
    try {
      const read = await readKkImportFile(f);
      const first = Math.max(
        0,
        read.sheets.findIndex((s) => s.rows.length > 0),
      );
      setFile(read);
      setSheet(first);
      setHdr(guessHeader(read.sheets[first]?.rows ?? []));
      setMap(null);
      setResult(null);
    } catch (e) {
      setErr(describeError(e).message ?? t("e.read"));
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    const missing = KK_IMPORT_FIELDS.filter((f) => f.req && effective[f.key] == null);
    if (missing.length) return setErr(t("e.required", { f: missing.map((f) => t(`f.${f.key}`)).join(", ") }));
    const rows = importRows(grid, hdr, effective);
    if (rows.length === 0) return setErr(t("e.empty"));
    if (rows.length > MAX_ROWS) return setErr(t("e.tooMany", { n: MAX_ROWS }));
    setErr("");
    setBusy(true);
    try {
      setResult(await importKkLines(rows));
    } catch (e) {
      setErr(describeError(e).message ?? t("e.check"));
    } finally {
      setBusy(false);
    }
  }

  function close() {
    reset();
    onClose();
  }

  const columns: TableColumn<KkImportLine>[] = [
    { key: "row", title: t("col.row"), align: "right", render: (l) => l.row },
    { key: "file", title: t("col.file"), wrap: true, render: (l) => l.fileName ?? "—" },
    {
      key: "product",
      title: t("col.product"),
      wrap: true,
      render: (l) =>
        l.productId != null ? (
          <span className="flex flex-col">
            <span className="font-medium">{l.productName}</span>
            <span className="font-mono text-caption text-text-secondary">{l.productCode}</span>
          </span>
        ) : (
          <span className="text-text-secondary">{t("notFound")}</span>
        ),
    },
    { key: "qty", title: t("f.qty"), align: "right", render: (l) => (l.qty != null ? formatQuantity(l.qty) : "—") },
    ...(prices
      ? [
          {
            key: "price",
            title: t("f.price"),
            align: "right" as const,
            render: (l: KkImportLine) => (l.price ? formatMoney(l.price) : "—"),
          },
        ]
      : []),
    { key: "batch", title: t("f.batch"), mono: true, render: (l) => l.batchNumber ?? "—" },
    {
      key: "status",
      title: t("col.status"),
      wrap: true,
      render: (l) => {
        const tone = importTone(l);
        const notes = knownProblems(l.problems)
          .map((p) => t(`problem.${p}`))
          .join(" · ");
        return (
          <span className="flex flex-col items-start gap-1">
            {tone === "ok" ? (
              <Badge tone="success" icon={CircleCheck}>
                {t("tone.ok")}
              </Badge>
            ) : tone === "check" ? (
              <Badge tone="warning" icon={CircleAlert}>
                {t("tone.check")}
              </Badge>
            ) : (
              <Badge tone="danger" icon={CircleSlash}>
                {t("tone.skip")}
              </Badge>
            )}
            {notes ? <span className="text-caption text-text-secondary">{notes}</span> : null}
          </span>
        );
      },
    },
  ];

  const primary = !file
    ? { label: t("choose"), onClick: () => input.current?.click(), loading: busy }
    : !result
      ? { label: t("check"), onClick: () => void check(), loading: busy }
      : {
          label: t("add", { n: ready.length }),
          disabled: ready.length === 0,
          onClick: () => {
            onAdd(ready);
            close();
          },
        };

  return (
    <Modal
      open={open}
      onClose={close}
      size="lg"
      title={t("title")}
      primaryAction={primary}
      secondaryAction={result ? { label: t("back"), onClick: () => setResult(null) } : undefined}
    >
      <input
        ref={input}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        data-testid="kk-import-file"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div className="flex flex-col gap-4">
        {err ? <Alert tone="danger" title={err} /> : null}
        {!file ? (
          <div className="flex flex-col items-center gap-2 rounded-card border-2 border-dashed border-border px-6 py-8 text-center">
            <FileSpreadsheet size={32} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
            <div className="font-medium">{t("dropTitle")}</div>
            <div className="text-caption text-text-secondary">{t("dropHint")}</div>
            <Button variant="secondary" icon={Upload} loading={busy} onClick={() => input.current?.click()}>
              {t("choose")}
            </Button>
          </div>
        ) : !result ? (
          <>
            <p className="text-caption text-text-secondary">{t("mapHint", { file: file.fileName })}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {file.sheets.length > 1 ? (
                <Select
                  label={t("sheet")}
                  value={String(sheet)}
                  onChange={(v) => {
                    const s = Number(v ?? 0);
                    setSheet(s);
                    setHdr(guessHeader(file.sheets[s]?.rows ?? []));
                    setMap(null);
                  }}
                  options={file.sheets.map((s, i) => ({ value: String(i), label: s.name }))}
                />
              ) : null}
              <Select
                label={t("headerRow")}
                value={String(hdr)}
                onChange={(v) => (setHdr(Number(v ?? 1)), setMap(null))}
                options={grid
                  .slice(0, 10)
                  .map((r, i) => ({ value: String(i + 1), label: `${i + 1}: ${r.filter(Boolean).slice(0, 3).join(" · ")}` }))}
              />
              {fields.map((f) => (
                <Select
                  key={f.key}
                  label={t(`f.${f.key}`)}
                  required={f.req}
                  placeholder={t("notMapped")}
                  value={effective[f.key] != null ? String(effective[f.key]) : null}
                  onChange={(v) => setMap({ ...effective, [f.key]: v == null ? undefined : Number(v) })}
                  options={colOptions}
                />
              ))}
            </div>
            {!prices ? <p className="text-caption text-text-secondary">{t("pricesHidden")}</p> : null}
          </>
        ) : (
          <>
            <p className="text-body">{t("summary", { ready: ready.length, skipped: result.length - ready.length })}</p>
            <Table caption={t("title")} density="compact" columns={columns} rows={result} rowKey={(l) => String(l.row)} />
          </>
        )}
      </div>
    </Modal>
  );
}
