"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  Check,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Database,
  Download,
  FileSpreadsheet,
  List,
  Minus,
  OctagonX,
  Plus,
  Trash2,
  TriangleAlert,
  Upload,
  WandSparkles,
  X,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useDeferredValue, useMemo, useRef, useState, type DragEvent } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatQuantity } from "@/lib/format";
import {
  CHECK_COLUMNS,
  EDITABLE,
  PRODUCT_FIELDS,
  autoMap,
  columnLetter,
  dataRows,
  mapFromProfile,
  mappingProblems,
  profileFromMap,
  records,
  toCsv,
  type FieldKey,
  type Fix,
  type Mapping,
} from "./import-model";

type ImportFile = components["schemas"]["ImportFile"];
type CheckResult = components["schemas"]["ImportCheckResult"];
type RowCheck = components["schemas"]["ImportRowCheck"];
type Step = 1 | 2 | 3 | 4 | 5;
type Filter = "all" | "OK" | "WARN" | "ERROR";

const MAX_BYTES = 10 * 1024 * 1024;

async function readFile(file: File): Promise<ImportFile> {
  await ensureCsrf();
  return unwrap(
    api.POST("/api/products/import/read", {
      body: { file: file as unknown as string },
      bodySerializer: () => {
        const fd = new FormData();
        fd.append("file", file);
        return fd;
      },
    }),
  );
}

async function check(rows: { row: number; values: Record<string, string> }[], apply: boolean): Promise<CheckResult> {
  await ensureCsrf();
  return unwrap(api.POST("/api/products/import/check", { params: { query: { apply } }, body: { rows } }));
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

const STATUS: Record<RowCheck["status"], { icon: LucideIcon; cls: string }> = {
  OK: { icon: CircleCheck, cls: "bg-success-bg text-success" },
  WARN: { icon: TriangleAlert, cls: "bg-warning-bg text-warning" },
  ERROR: { icon: OctagonX, cls: "bg-danger-bg text-danger" },
};

/** Import ustasi — mahsulotlar (prototip `ImportWizard`, turi «products»): 5 qadam, toʻliq sahifa. */
export function ProductImportWizard() {
  const t = useTranslations("products.wizard");
  const router = useRouter();
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>(1);
  const [max, setMax] = useState<Step>(1);
  const [file, setFile] = useState<ImportFile | null>(null);
  const [drag, setDrag] = useState(false);
  const [sheet, setSheet] = useState(0);
  const [hdr, setHdr] = useState(1);
  const [map, setMap] = useState<Mapping>({});
  const [mapNote, setMapNote] = useState<{ kind: "auto" | "profile" | "saved"; text: string } | null>(null);
  const [fix, setFix] = useState<Fix>({});
  const [filter, setFilter] = useState<Filter>("all");
  const [err, setErr] = useState("");

  const label = (k: string) => t(`f.${k as FieldKey}`);
  const grid = useMemo(() => (file ? ((file.sheets[sheet] ?? file.sheets[0])?.rows ?? []) : []), [file, sheet]);
  const headers = useMemo(() => (grid[hdr - 1] ?? []).map((h) => String(h ?? "")), [grid, hdr]);
  const rows = useMemo(() => dataRows(grid, hdr), [grid, hdr]);

  const profile = useQuery({
    queryKey: ["products", "import-profile"],
    queryFn: async () => {
      const r = await api.GET("/api/products/import/profile");
      if (r.response.status === 204) return null;
      return unwrap(Promise.resolve(r));
    },
  });

  const upload = useMutation({
    mutationFn: readFile,
    onSuccess: (f) => {
      const first = f.sheets.findIndex((s) => s.rows.length > 0);
      setFile(f);
      setSheet(first < 0 ? 0 : first);
      setHdr(guessHeader(f.sheets[first < 0 ? 0 : first]?.rows ?? []));
      setMap({});
      setFix({});
      setMax(1);
      setErr("");
    },
    onError: (e) => setErr(describeError(e).message ?? t("e.read")),
  });

  function handleFile(f: File | undefined) {
    if (!f) return;
    const ext = (f.name.split(".").pop() ?? "").toLowerCase();
    if (!["xlsx", "csv"].includes(ext)) return setErr(t("e.type"));
    if (f.size > MAX_BYTES) return setErr(t("e.size"));
    setErr("");
    upload.mutate(f);
  }

  function initialMap(): { map: Mapping; note: { kind: "auto" | "profile"; text: string } } {
    const p = profile.data;
    if (p) {
      const m = mapFromProfile(p.mapping, headers);
      if (Object.keys(m).length) return { map: m, note: { kind: "profile", text: t("profApplied", { p: p.name }) } };
    }
    const m = autoMap(PRODUCT_FIELDS, headers);
    return { map: m, note: { kind: "auto", text: t("autoDone", { a: Object.keys(m).length, b: PRODUCT_FIELDS.length }) } };
  }

  // ===== 4-qadam: tekshiruv (har tuzatishda qayta, kechiktirilgan) =====
  const recs = useMemo(() => records(grid, hdr, map, fix), [grid, hdr, map, fix]);
  const deferred = useDeferredValue(recs);
  const checked = useQuery({
    queryKey: ["products", "import-check", deferred],
    queryFn: () => check(deferred, false),
    enabled: max >= 4 && deferred.length > 0,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
  });
  const V = checked.data?.rows ?? [];
  const cnt = { OK: checked.data?.ok ?? 0, WARN: checked.data?.warn ?? 0, ERROR: checked.data?.error ?? 0 };
  const good = cnt.OK + cnt.WARN;

  const apply = useMutation({
    mutationFn: () => check(recs, true),
    onSuccess: async (r) => {
      toast({ tone: "success", title: t("done", { a: formatQuantity(r.created), b: r.error }) });
      await qc.invalidateQueries({ queryKey: ["products"] });
      await qc.invalidateQueries({ queryKey: ["dictionaries"] });
      router.push("/products");
    },
    onError: (e) => setErr(describeError(e).message ?? t("e.apply")),
  });

  function stepErr(n: Step): string {
    if (n === 1 && !file) return t("e.file");
    if (n === 2 && !(hdr >= 1 && hdr <= grid.length)) return t("e.hdr", { n: grid.length });
    if (n === 3) {
      const p = mappingProblems(PRODUCT_FIELDS, map);
      if (p.missing.length) return t("e.map", { f: p.missing.map(label).join(", ") });
      if (p.dup.length) return t("e.mapDup", { f: p.dup.map(label).join(", ") });
    }
    if (n === 4 && checked.isFetching) return t("e.checking");
    return "";
  }

  function next() {
    const e = stepErr(step);
    if (e) return setErr(e);
    if (step === 5) {
      if (!good) return setErr(t("e.none"));
      return apply.mutate();
    }
    const n = (step + 1) as Step;
    if (n === 3 && (max < 3 || !Object.keys(map).length)) {
      const init = initialMap();
      setMap(init.map);
      setMapNote(init.note);
    }
    setStep(n);
    setMax((m) => (n > m ? n : m));
    setErr("");
  }

  function back() {
    if (step === 1) return router.push("/products");
    setStep((step - 1) as Step);
    setErr("");
  }

  function resetAfter2() {
    setMap({});
    setFix({});
    setMax(2);
  }

  const subs = [
    file?.fileName ?? "",
    file && max >= 2 ? `${file.sheets[sheet]?.name ?? ""} · ${hdr}` : "",
    max >= 3
      ? `${PRODUCT_FIELDS.filter((f) => f.req && (map[f.key] ?? -1) >= 0).length}/${PRODUCT_FIELDS.filter((f) => f.req).length}`
      : "",
    max >= 4 && V.length ? `${cnt.OK} · ${cnt.WARN} · ${cnt.ERROR}` : "",
    "",
  ];

  const errRows = V.filter((v) => v.status === "ERROR");
  function dlErr() {
    if (!file) return;
    const out = [headers.concat([t("cMsg")])].concat(
      errRows.map((v) => {
        const cells = rows.find((r) => r.i === v.row)?.cells ?? [];
        const width = Math.max(headers.length, cells.length);
        const line = Array.from({ length: width }, (_, j) => {
          const f = (Object.keys(map) as FieldKey[]).find((k) => map[k] === j);
          const fixed = f ? fix[v.row]?.[f] : undefined;
          return fixed ?? String(cells[j] ?? "");
        });
        return line.concat([
          v.messages
            .filter((m) => m.tone === "ERROR")
            .map((m) => msgText(m))
            .join("; "),
        ]);
      }),
    );
    download(`${file.fileName.replace(/\.(xlsx|csv)$/i, "")}_xatolar.csv`, toCsv(out));
    toast({ tone: "success", title: t("tDl", { n: errRows.length }) });
  }

  function msgText(m: RowCheck["messages"][number]): string {
    const p: Record<string, string> = { ...m.params };
    if (p.f) p.f = label(p.f);
    return t(`m.${m.key}` as "m.pReq", p);
  }

  async function saveProfile() {
    const e = stepErr(3);
    if (e) return setErr(e);
    const name = t("profName");
    try {
      await ensureCsrf();
      await unwrap(api.PUT("/api/products/import/profile", { body: { name, mapping: profileFromMap(map, headers) } }));
      await qc.invalidateQueries({ queryKey: ["products", "import-profile"] });
      setMapNote({ kind: "saved", text: t("profSaved", { p: name }) });
    } catch (x) {
      setErr(describeError(x).message ?? t("e.apply"));
    }
  }

  const first = rows[0]?.cells ?? [];
  const colOpts = [{ value: "-1", label: t("notMapped") }].concat(
    headers.map((h, i) => ({ value: String(i), label: h.trim() || t("col", { n: i + 1 }), sub: columnLetter(i) })),
  );
  const shown = V.filter((v) => filter === "all" || v.status === filter);
  const pvN = Math.max(...grid.slice(0, 5).map((r) => r.length), 1);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-secondary">
            <Ic icon={Database} px={14} className="flex-none text-primary" />
            <span className="truncate">{t("crumb")}</span>
          </span>
          <h1 className="text-page-title">{t("title")}</h1>
        </div>
        <Button variant="secondary" icon={X} onClick={() => router.push("/products")}>
          {t("close")}
        </Button>
      </div>

      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[232px_minmax(0,1fr)]">
        <nav
          aria-label={t("title")}
          className="flex min-w-0 gap-1 overflow-x-auto rounded-card border border-border bg-surface p-2 shadow-sm lg:sticky lg:top-0 lg:flex-col"
        >
          {([1, 2, 3, 4, 5] as Step[]).map((n) => {
            const cur = n === step;
            const done = !cur && n <= max;
            return (
              <button
                key={n}
                type="button"
                aria-current={cur ? "step" : undefined}
                onClick={() => n <= max && n !== step && (setStep(n), setErr(""))}
                className={cn(
                  "flex min-w-0 flex-none items-center gap-2.5 rounded-control px-2.5 py-2 text-left lg:flex-auto",
                  cur && "bg-primary-soft",
                  n <= max ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "flex size-6 flex-none items-center justify-center rounded-full text-caption font-semibold",
                    done
                      ? "bg-primary text-white"
                      : cur
                        ? "border-2 border-primary text-primary"
                        : "border border-border text-text-secondary",
                  )}
                >
                  {done ? <Ic icon={Check} px={14} /> : n}
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className={cn("truncate", cur ? "font-semibold" : done ? "" : "text-text-secondary")}>{t(`w${n}`)}</span>
                  {subs[n - 1] ? <span className="truncate text-caption text-text-secondary">{subs[n - 1]}</span> : null}
                </span>
              </button>
            );
          })}
        </nav>

        <section className="flex min-w-0 flex-col gap-5 rounded-card border border-border bg-surface p-6 shadow-sm">
          <div className="flex flex-col gap-1.5">
            <span className="text-caption font-medium text-primary">{t("stepOf", { n: step })}</span>
            <h2 className="text-section-title">{t(`w${step}`)}</h2>
            {step < 5 ? <p className="max-w-[720px] text-text-secondary">{t(`w${step}D`)}</p> : null}
          </div>
          {err ? (
            <div
              role="alert"
              className="flex items-center gap-2.5 rounded-control border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-danger"
            >
              <Icon icon={CircleAlert} className="flex-none" />
              <span>{err}</span>
            </div>
          ) : null}

          {step === 1 ? (
            file ? (
              <div className="flex items-center gap-3 rounded-card border border-border bg-background px-4 py-3.5">
                <span className="flex size-10 flex-none items-center justify-center rounded-card bg-success-bg text-success">
                  <Ic icon={FileSpreadsheet} px={20} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-mono font-medium">{file.fileName}</span>
                  <span className="text-caption text-text-secondary">
                    {`${(file.size / 1024).toFixed(1).replace(".", ",")} KB · ${t("sheetsN", { n: file.sheets.length })} · ${t("dataN", { n: formatQuantity(dataRows(file.sheets[sheet]?.rows ?? [], hdr).length) })}`}
                  </span>
                </span>
                <Button variant="secondary" size="sm" icon={Trash2} onClick={() => (setFile(null), setMax(1), setMap({}), setFix({}))}>
                  {t("remove")}
                </Button>
              </div>
            ) : (
              <>
                <div
                  onDragOver={(e: DragEvent) => (e.preventDefault(), setDrag(true))}
                  onDragLeave={() => setDrag(false)}
                  onDrop={(e: DragEvent) => (e.preventDefault(), setDrag(false), handleFile(e.dataTransfer.files?.[0]))}
                  className={cn(
                    "flex min-h-[200px] flex-col items-center justify-center gap-2.5 rounded-card border-[1.5px] border-dashed p-6 text-center",
                    drag ? "border-primary bg-primary-soft" : "border-border bg-surface",
                  )}
                >
                  <span className="flex size-11 items-center justify-center rounded-card bg-primary-soft text-primary">
                    <Ic icon={Upload} px={22} />
                  </span>
                  <span>
                    {t("drop")}{" "}
                    <button
                      type="button"
                      onClick={() => input.current?.click()}
                      className="font-semibold text-primary underline underline-offset-2"
                      disabled={upload.isPending}
                    >
                      {t("pick")}
                    </button>
                  </span>
                  <span className="text-caption text-text-secondary">{upload.isPending ? t("reading") : t("dropHint")}</span>
                  <input
                    ref={input}
                    type="file"
                    accept=".xlsx,.csv"
                    className="hidden"
                    aria-label={t("pick")}
                    data-testid="import-file"
                    onChange={(e) => (handleFile(e.target.files?.[0]), (e.target.value = ""))}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-end gap-3">
                  <a
                    href="/api/products/import-template"
                    download
                    className="inline-flex items-center gap-1.5 font-medium text-primary hover:underline"
                  >
                    <Icon icon={Download} />
                    {t("tpl")}
                  </a>
                </div>
              </>
            )
          ) : null}

          {step === 2 && file ? (
            <>
              <div className="grid max-w-[720px] items-start gap-x-5 gap-y-4 md:grid-cols-2">
                <Select
                  label={t("sheet")}
                  required
                  options={file.sheets.map((s, i) => ({
                    value: String(i),
                    label: s.name,
                    sub: t("dataN", { n: Math.max(0, s.rows.length - 1) }),
                  }))}
                  value={String(sheet)}
                  onChange={(v) => (setSheet(Number(v ?? 0)), setHdr(1), resetAfter2())}
                />
                <div className="flex min-w-0 flex-col gap-1.5">
                  <span className="text-caption font-medium">
                    {t("hdrRow")} <span className="text-danger">*</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <Button variant="icon" icon={Minus} aria-label="−" onClick={() => (setHdr((h) => Math.max(1, h - 1)), resetAfter2())} />
                    <input
                      value={String(hdr)}
                      inputMode="numeric"
                      aria-label={t("hdrRow")}
                      onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        setHdr(Number.isNaN(n) ? 0 : n);
                        resetAfter2();
                      }}
                      className="h-[34px] w-16 rounded-control border border-border bg-surface px-2.5 text-center outline-none focus:border-primary"
                    />
                    <Button
                      variant="icon"
                      icon={Plus}
                      aria-label="+"
                      onClick={() => (setHdr((h) => Math.min(grid.length, h + 1)), resetAfter2())}
                    />
                  </div>
                  <span className="text-caption text-text-secondary">{t("hdrHint")}</span>
                </div>
              </div>
              <div className="flex min-w-0 flex-col gap-2">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="font-semibold">{t("preview")}</span>
                  <span className="text-caption text-text-secondary">{t("dataN", { n: formatQuantity(rows.length) })}</span>
                </div>
                <div className="overflow-x-auto rounded-control border border-border">
                  <div style={{ minWidth: 72 + pvN * 110 }}>
                    {grid.slice(0, 5).map((r, i) => {
                      const isHdr = i + 1 === hdr;
                      return (
                        <div
                          key={i}
                          className={cn(
                            "grid min-h-9 items-center border-b border-border last:border-b-0",
                            isHdr ? "bg-primary-soft font-semibold" : "bg-surface",
                          )}
                          style={{ gridTemplateColumns: `72px repeat(${pvN}, minmax(110px, 1fr))` }}
                        >
                          <span className="flex items-center gap-1 px-2 text-caption font-normal text-text-secondary">
                            {i + 1}
                            {isHdr ? (
                              <span className="rounded-sm bg-primary px-1 text-[10px] leading-4 text-white">{t("hdrMark")}</span>
                            ) : null}
                          </span>
                          {Array.from({ length: pvN }, (_, j) => (
                            <span key={j} title={r[j] ?? ""} className="truncate border-l border-border px-2.5 text-caption">
                              {r[j] ?? ""}
                            </span>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {step === 3 ? (
            <>
              {mapNote ? (
                <div
                  role="note"
                  className={cn(
                    "flex items-center gap-2.5 rounded-control border px-3.5 py-2.5",
                    mapNote.kind === "saved" ? "border-success/30 bg-success-bg text-success" : "border-info/30 bg-info-bg text-info",
                  )}
                >
                  <Icon
                    icon={mapNote.kind === "profile" ? BookmarkCheck : mapNote.kind === "saved" ? CircleCheck : WandSparkles}
                    className="flex-none"
                  />
                  <span>{mapNote.text}</span>
                </div>
              ) : null}
              <div className="overflow-x-auto rounded-control border border-border">
                <div className="min-w-[720px]">
                  <div className="grid h-9 grid-cols-[minmax(180px,0.9fr)_28px_minmax(220px,1fr)_minmax(200px,1fr)] items-center border-b border-border bg-table-header text-caption font-medium text-text-secondary">
                    <span className="px-3.5">{t("fMedix")}</span>
                    <span />
                    <span className="px-3">{t("fFile")}</span>
                    <span className="px-3">{t("fSample")}</span>
                  </div>
                  {PRODUCT_FIELDS.map((f) => {
                    const ix = map[f.key];
                    const on = ix != null && ix >= 0;
                    const raw = on ? String(first[ix] ?? "") : "";
                    const bad = !!err && f.req && !on;
                    return (
                      <div
                        key={f.key}
                        data-field={f.key}
                        className="grid min-h-[60px] grid-cols-[minmax(180px,0.9fr)_28px_minmax(220px,1fr)_minmax(200px,1fr)] items-center border-b border-border last:border-b-0"
                      >
                        <span className="flex min-w-0 items-center gap-2 px-3.5">
                          <Icon
                            icon={on ? CircleCheck : f.req ? CircleAlert : CircleDashed}
                            className={cn("flex-none", on ? "text-success" : f.req ? "text-danger" : "text-text-secondary")}
                          />
                          <span className="flex min-w-0 flex-col">
                            <span className="font-medium">
                              {label(f.key)}
                              {f.req ? <span className="text-danger"> *</span> : null}
                            </span>
                            {!f.req ? <span className="text-caption text-text-secondary">{t("optional")}</span> : null}
                          </span>
                        </span>
                        <Icon icon={ArrowLeft} className="text-text-secondary" />
                        <div className="min-w-0 px-3 py-2">
                          <Select
                            label={label(f.key)}
                            size="sm"
                            className="[&>span:first-child]:sr-only"
                            options={colOpts}
                            value={on ? String(ix) : "-1"}
                            error={bad ? t("req") : undefined}
                            onChange={(v) => {
                              const n = Number(v ?? -1);
                              setMap((m) => {
                                const c = { ...m };
                                if (n < 0) delete c[f.key];
                                else c[f.key] = n;
                                return c;
                              });
                              setMapNote(null);
                              setErr("");
                            }}
                          />
                        </div>
                        <span className={cn("truncate px-3 font-mono text-caption", on ? "" : "text-text-secondary")}>
                          {on ? raw || "—" : "—"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  icon={WandSparkles}
                  onClick={() => {
                    const m = autoMap(PRODUCT_FIELDS, headers);
                    setMap(m);
                    setErr("");
                    setMapNote({ kind: "auto", text: t("autoDone", { a: Object.keys(m).length, b: PRODUCT_FIELDS.length }) });
                  }}
                >
                  {t("auto")}
                </Button>
                <Button variant="secondary" icon={BookmarkPlus} onClick={saveProfile}>
                  {t("saveProf")}
                </Button>
              </div>
            </>
          ) : null}

          {step === 4 ? (
            <>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {(
                  [
                    ["all", List, "bg-background text-text-secondary", V.length],
                    ["OK", CircleCheck, "bg-success-bg text-success", cnt.OK],
                    ["WARN", TriangleAlert, "bg-warning-bg text-warning", cnt.WARN],
                    ["ERROR", OctagonX, "bg-danger-bg text-danger", cnt.ERROR],
                  ] as const
                ).map(([k, icon, cls, n]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filter === k}
                    onClick={() => setFilter(filter === k && k !== "all" ? "all" : k)}
                    className={cn(
                      "flex min-w-0 items-center gap-2.5 rounded-card border bg-surface px-3 py-2.5 text-left hover:border-primary",
                      filter === k ? "border-primary" : "border-border",
                    )}
                  >
                    <span className={cn("flex size-7 flex-none items-center justify-center rounded-control", cls)}>
                      <Icon icon={icon} />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="text-caption text-text-secondary">{t(`k.${k}`)}</span>
                      <span className="text-[18px] font-semibold leading-6">{formatQuantity(n)}</span>
                    </span>
                  </button>
                ))}
              </div>
              {checked.isError ? (
                <div
                  role="alert"
                  className="flex items-center gap-2.5 rounded-control border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-danger"
                >
                  <Icon icon={CircleAlert} className="flex-none" />
                  <span>{describeError(checked.error).message ?? t("e.apply")}</span>
                </div>
              ) : null}
              <div
                className={cn("max-h-[560px] overflow-auto rounded-control border border-border", checked.isFetching && "opacity-70")}
                aria-busy={checked.isFetching}
              >
                <table className="w-full min-w-[1390px] border-collapse text-table">
                  <thead className="sticky top-0 z-[3] bg-table-header text-caption font-medium text-text-secondary">
                    <tr className="h-[38px] border-b border-border">
                      <th className="sticky left-0 z-[4] w-32 bg-table-header px-2.5 text-left font-medium shadow-[8px_0_8px_-8px_rgba(18,60,58,0.18)]">
                        {t("cSt")}
                      </th>
                      <th className="w-[52px] px-2.5 text-left font-medium">{t("cRow")}</th>
                      {CHECK_COLUMNS.map((k) => (
                        <th key={k} className="px-2.5 text-left font-medium whitespace-nowrap">
                          {k === "match" ? t("cMatch") : k === "msg" ? t("cMsg") : label(k)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {checked.isPending && !checked.data ? (
                      <tr>
                        <td colSpan={CHECK_COLUMNS.length + 2} className="px-4 py-8 text-center text-text-secondary">
                          {t("checking")}
                        </td>
                      </tr>
                    ) : shown.length === 0 ? (
                      <tr>
                        <td colSpan={CHECK_COLUMNS.length + 2} className="px-4 py-8 text-center text-text-secondary">
                          {t("noRows")}
                        </td>
                      </tr>
                    ) : (
                      shown.map((v) => {
                        const S = STATUS[v.status];
                        const rec = recs.find((r) => r.row === v.row);
                        const editable = v.status !== "OK";
                        return (
                          <tr
                            key={v.row}
                            data-row={v.row}
                            className={cn("border-b border-border align-middle", v.status === "ERROR" ? "bg-danger-bg" : "bg-surface")}
                          >
                            <td
                              className={cn(
                                "sticky left-0 z-[2] px-2.5 shadow-[8px_0_8px_-8px_rgba(18,60,58,0.18)]",
                                v.status === "ERROR" ? "bg-danger-bg" : "bg-surface",
                              )}
                            >
                              <span
                                className={cn(
                                  "inline-flex h-[22px] items-center gap-1 rounded-control pr-2 pl-1.5 text-caption font-medium",
                                  S.cls,
                                )}
                              >
                                <Ic icon={S.icon} px={14} />
                                {t(`s.${v.status}`)}
                              </span>
                            </td>
                            <td className="px-2.5 text-caption text-text-secondary">{v.row}</td>
                            {CHECK_COLUMNS.map((k) => {
                              if (k === "msg") {
                                return (
                                  <td key={k} className="min-w-[260px] px-2.5 py-1.5">
                                    <div className="flex flex-col gap-0.5">
                                      {v.messages.length ? (
                                        v.messages.map((m, i) => (
                                          <span
                                            key={i}
                                            className={cn(
                                              "flex items-start gap-1 text-caption",
                                              m.tone === "ERROR" ? "text-danger" : "text-warning",
                                            )}
                                          >
                                            <Ic icon={m.tone === "ERROR" ? OctagonX : TriangleAlert} px={12} className="mt-0.5 flex-none" />
                                            {msgText(m)}
                                          </span>
                                        ))
                                      ) : (
                                        <span className="text-caption text-text-secondary">—</span>
                                      )}
                                    </div>
                                  </td>
                                );
                              }
                              if (k === "match") {
                                return (
                                  <td
                                    key={k}
                                    className={cn("px-2.5 font-medium", v.status === "ERROR" ? "text-text-secondary" : "text-success")}
                                  >
                                    {v.status === "ERROR" ? "—" : v.codeAuto ? t("m.pNewAuto") : t("m.pNew", { c: v.code ?? "" })}
                                  </td>
                                );
                              }
                              const raw = rec?.values[k] ?? "";
                              if (editable && EDITABLE.includes(k)) {
                                const badField = v.messages.some(
                                  (m) =>
                                    m.tone === "ERROR" &&
                                    (m.params.f === k ||
                                      (k === "barcode" && m.key.startsWith("pBc")) ||
                                      (k === "ikpu" && m.key === "pIkpuBad") ||
                                      (k === "name" && m.key.startsWith("pNameDup"))),
                                );
                                return (
                                  <td key={k} className="px-2.5 py-1.5">
                                    <input
                                      value={raw}
                                      aria-label={`${label(k)} · ${v.row}`}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        setFix((fx) => ({ ...fx, [v.row]: { ...(fx[v.row] ?? {}), [k]: val } }));
                                      }}
                                      className={cn(
                                        "h-[30px] w-full rounded-sm border bg-surface px-2 text-caption outline-none focus:border-primary",
                                        ["code", "barcode", "ikpu"].includes(k) && "font-mono",
                                        badField ? "border-danger" : "border-border",
                                      )}
                                    />
                                  </td>
                                );
                              }
                              return (
                                <td
                                  key={k}
                                  className={cn(
                                    "max-w-[240px] truncate px-2.5",
                                    ["code", "barcode", "ikpu"].includes(k) && "font-mono text-caption",
                                  )}
                                  title={raw}
                                >
                                  {raw || "—"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {step === 5 ? (
            <>
              <div
                className={cn(
                  "flex items-start gap-3.5 rounded-card border px-4.5 py-4",
                  good ? "border-success/30 bg-success-bg" : "border-danger/30 bg-danger-bg",
                )}
              >
                <span
                  className={cn(
                    "flex size-10 flex-none items-center justify-center rounded-card bg-surface",
                    good ? "text-success" : "text-danger",
                  )}
                >
                  <Ic icon={good ? CircleCheck : CircleAlert} px={22} />
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-[17px] leading-6 font-semibold">
                    {cnt.ERROR
                      ? t("resT", { a: formatQuantity(good), b: formatQuantity(cnt.ERROR) })
                      : t("resT0", { a: formatQuantity(good) })}
                  </span>
                  <span className="text-caption text-text-secondary">{t("w5D")}</span>
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                {(
                  [
                    [t("rNew"), formatQuantity(good)],
                    [t("rWarn"), formatQuantity(cnt.WARN)],
                    [t("rMakers"), formatQuantity(checked.data?.newManufacturers.length ?? 0)],
                    [t("rCats"), formatQuantity(checked.data?.newCategories.length ?? 0)],
                  ] as const
                ).map(([l, n]) => (
                  <div key={l} className="flex min-w-0 flex-col gap-1 rounded-card border border-border px-3.5 py-3">
                    <span className="text-caption text-text-secondary">{l}</span>
                    <span className="text-[18px] leading-6 font-semibold">{n}</span>
                  </div>
                ))}
              </div>
              {(checked.data?.newManufacturers.length ?? 0) + (checked.data?.newCategories.length ?? 0) > 0 ? (
                <p className="text-caption text-text-secondary">
                  {checked.data?.newManufacturers.length ? t("newMakers", { list: checked.data.newManufacturers.join(", ") }) : ""}
                  {checked.data?.newCategories.length ? t("newCats", { list: checked.data.newCategories.join(", ") }) : ""}
                </p>
              ) : null}
              {errRows.length ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-danger/30 bg-danger-bg px-3.5 py-3">
                  <span className="flex min-w-0 flex-col">
                    <span className="font-semibold text-danger">{t("errRowsT", { b: formatQuantity(errRows.length) })}</span>
                    <span className="text-caption text-text-secondary">{t("dlErrD")}</span>
                  </span>
                  <Button variant="secondary" icon={Download} onClick={dlErr}>
                    {t("dlErr")}
                  </Button>
                </div>
              ) : null}
            </>
          ) : null}
        </section>
      </div>

      <div className="sticky -bottom-6 z-[5] -mx-6 -mb-6 flex h-16 items-center justify-center self-stretch border-t border-border bg-surface">
        <div className="flex w-full max-w-[1280px] items-center justify-between gap-3 px-6">
          <span className="flex min-w-0 items-center gap-2 text-text-secondary">
            {err ? (
              <>
                <span className="size-2 flex-none rounded-full bg-warning" />
                <span className="truncate">{err}</span>
              </>
            ) : null}
          </span>
          <div className="flex flex-none gap-2">
            <Button variant="secondary" onClick={back}>
              {step === 1 ? t("close") : t("back")}
            </Button>
            <Button icon={step === 5 ? Check : undefined} loading={apply.isPending || (step === 1 && upload.isPending)} onClick={next}>
              {step === 5 ? t("create", { n: formatQuantity(good) }) : t("next")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Ic({ icon: Glyph, px, className }: { icon: LucideIcon; px: number; className?: string }) {
  return <Glyph size={px} strokeWidth={1.5} aria-hidden className={className} />;
}

/** Sarlavha qatori taxmini: birinchi 10 qatordan eng koʻp toʻldirilgani (SmartUp eksportida tepada hisobot nomi boʻladi). */
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
