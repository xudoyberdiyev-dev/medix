"use client";

import { Bookmark, FileSpreadsheet, Printer, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { usePeriodState, type PeriodState } from "@/features/home/period-picker";
import {
  addReport,
  MAX_REPORT_NAME,
  MAX_REPORTS,
  parseReports,
  presetFromParam,
  removeReport,
  SAVED_REPORTS_KEY,
  type SavedReport,
} from "@/lib/saved-reports";

function read(): SavedReport[] {
  try {
    return parseReports(localStorage.getItem(SAVED_REPORTS_KEY));
  } catch {
    return [];
  }
}

function write(list: SavedReport[]) {
  try {
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(list));
  } catch {
    /* xotira yopiq — saqlanmaydi */
  }
}

/** Hisobot davri: saqlangan hisobotdan ochilsa URL'dagi `period` qoʻllanadi. */
export function useReportPeriod(): PeriodState {
  const params = useSearchParams();
  return usePeriodState(presetFromParam(params.get("period")));
}

/** «Saqlash» (prototip Reports — askSave): joriy hisobot sozlamasini nom bilan saqlaydi. */
export function SaveReportButton({ href, defaultName }: { href: string; defaultName: string }) {
  const t = useTranslations("reports.saved");
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>();

  function save() {
    const r = addReport(read(), name.trim() || defaultName, href);
    if (!r.ok) {
      setError(
        r.error === "tooLong"
          ? t("tooLong", { max: MAX_REPORT_NAME })
          : r.error === "limit"
            ? t("limit", { max: MAX_REPORTS })
            : t("empty"),
      );
      return;
    }
    write(r.reports);
    setOpen(false);
    toast({ tone: "success", title: t("done") });
  }

  return (
    <>
      <Button
        variant="secondary"
        icon={Bookmark}
        onClick={() => {
          setName("");
          setError(undefined);
          setOpen(true);
        }}
      >
        {t("save")}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t("title")} size="sm" primaryAction={{ label: t("save"), onClick: save }}>
        <div className="flex flex-col gap-3">
          <p className="text-caption text-text-secondary">{t("hint")}</p>
          <TextField
            label={t("name")}
            value={name}
            onChange={(v) => {
              setName(v);
              setError(undefined);
            }}
            placeholder={defaultName}
            maxLength={MAX_REPORT_NAME + 10}
            error={error}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>
      </Modal>
    </>
  );
}

/** Katalogdagi «Mening hisobotlarim» (prototip — SavedViews yorliqlari). Boʻsh boʻlsa koʻrsatilmaydi. */
export function MyReports({ allowed }: { allowed: (href: string) => boolean }) {
  const t = useTranslations("reports.saved");
  const [list, setList] = useState<SavedReport[]>([]);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- brauzer xotirasi faqat mijozda (SSR bilan toʻqnashmasin)
  useEffect(() => setList(read()), []);
  const visible = list.filter((r) => allowed(r.href));
  if (visible.length === 0) return null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="reports-mine">
      <h2 id="reports-mine" className="text-body font-semibold">
        {t("mine")}
      </h2>
      <ul className="flex gap-6 overflow-x-auto border-b border-border">
        {visible.map((r) => (
          <li key={r.name} className="group -mb-px flex flex-none items-center gap-1 border-b-2 border-transparent hover:border-border">
            <Link href={r.href} className="flex h-[38px] items-center px-0.5 text-caption text-text-secondary hover:text-text-primary">
              {r.name}
            </Link>
            <button
              type="button"
              aria-label={t("remove", { name: r.name })}
              className="rounded-sm p-0.5 text-text-secondary opacity-60 hover:opacity-100 focus-visible:opacity-100"
              onClick={() => {
                const next = removeReport(read(), r.name);
                write(next);
                setList(next);
              }}
            >
              <X size={14} strokeWidth={1.5} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Hisobot sarlavhasi amallari (prototip Reports): «Saqlash», «Chop etish», asosiy — «Excelʼga yuklab olish». */
export function ReportActions({ href, defaultName, exportHref }: { href: string; defaultName: string; exportHref: string | null }) {
  const t = useTranslations("reports");
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <SaveReportButton href={href} defaultName={defaultName} />
      <Button variant="secondary" icon={Printer} onClick={() => window.print()}>
        {t("print")}
      </Button>
      <Button
        icon={FileSpreadsheet}
        disabled={!exportHref}
        onClick={() => {
          if (!exportHref) return;
          const a = document.createElement("a");
          a.href = exportHref;
          a.download = "";
          a.click();
        }}
      >
        {t("export")}
      </Button>
    </div>
  );
}
