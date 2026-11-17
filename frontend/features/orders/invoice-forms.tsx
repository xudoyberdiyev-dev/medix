"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { ensureCsrf } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatMoney } from "@/lib/format";

type FormRow = components["schemas"]["FormRow"];
export type FormType = "WAREHOUSE" | "WAREHOUSE2" | "CLIENT_SEND" | "CLIENT1" | "CLIENT2";

/** O18: 5 faktura turi — nomlari va ustunlari shablondagidek (fakturaning oʻzi kirill). */
export const FORM_TYPES: { type: FormType; title: string; priced: boolean; cols: Col[] }[] = [
  {
    type: "WAREHOUSE",
    title: "Фактура для склада",
    priced: true,
    cols: ["area", "name", "manufacturer", "series", "qty", "expiry", "unit", "price", "total"],
  },
  {
    type: "WAREHOUSE2",
    title: "Фактура для склада №2",
    priced: false,
    cols: ["area", "name", "manufacturer", "series", "qty", "expiry", "unit"],
  },
  {
    type: "CLIENT_SEND",
    title: "Фактура для Клиентов отправка",
    priced: true,
    cols: ["farmId", "name", "manufacturer", "series", "qty", "expiry", "unit", "price", "total"],
  },
  {
    type: "CLIENT1",
    title: "Фактура Для клиента №1",
    priced: true,
    cols: ["name", "manufacturer", "series", "qty", "expiry", "unit", "price", "total"],
  },
  {
    type: "CLIENT2",
    title: "Фактура Для Клиента №2",
    priced: true,
    cols: ["name", "manufacturer", "qty", "expiry", "unit", "price", "total"],
  },
];

type Col = "area" | "farmId" | "name" | "manufacturer" | "series" | "qty" | "expiry" | "unit" | "price" | "total";
type EditCol = Exclude<Col, "total">;

export const COL_TITLES: Record<Col, string> = {
  area: "Худуд",
  farmId: "Фарм ИД",
  name: "Махсулот номи",
  manufacturer: "Ишлаб чикарувчиси",
  series: "Серия",
  qty: "Сони",
  expiry: "Яроклик муддати",
  unit: "Ул/Бирлиги",
  price: "ККС билан Нархи",
  total: "ККС билан Жами киймати (Сумма)",
};

/** Qatorni sudrab koʻchirish: `from` dagi qator `to` oʻrniga (qolganlari suriladi). */
export function moveRow<T>(rows: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= rows.length || to >= rows.length) return rows;
  const next = [...rows];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}

/** Qator summasi: soni × narx (tiyin aniqligida, float xatosisiz). */
export function rowTotal(qty: number, price: string | null | undefined): string {
  if (!price || !/^\d+(\.\d{1,2})?$/.test(price)) return "0.00";
  const [i, f = ""] = price.split(".");
  const cents = BigInt(i) * 100n + BigInt((f + "00").slice(0, 2));
  const total = cents * BigInt(Math.max(0, Math.trunc(qty)));
  const s = total.toString().padStart(3, "0");
  return `${s.slice(0, -2)}.${s.slice(-2)}`;
}

/** Tuzatilgan kataklar soni: joriy va asl qatorlarni tartib boʻyicha solishtiradi (qoʻshilgan qator — barcha toʻldirilgan kataklari). */
export function changedCells(rows: FormRow[], original: FormRow[]): number {
  const cols: EditCol[] = ["area", "farmId", "name", "manufacturer", "series", "qty", "expiry", "unit", "price"];
  let n = 0;
  rows.forEach((r, i) => {
    const o = original[i];
    for (const c of cols) if (cellValue(r, c) !== (o ? cellValue(o, c) : "")) n++;
  });
  return n + Math.max(0, original.length - rows.length);
}

function cellValue(r: FormRow, c: EditCol): string {
  const v = r[c];
  if (v === null || v === undefined) return "";
  if (c === "price") return Number(v).toFixed(2);
  return String(v);
}

function withTotal(r: FormRow): FormRow {
  return { ...r, total: r.price == null ? undefined : rowTotal(r.qty, r.price) };
}

export function InvoiceFormsModal(props: { orderId: number; initial: FormType; onClose: () => void }) {
  const t = useTranslations("orders.invoiceForms");
  const qc = useQueryClient();
  const [type, setType] = useState<FormType>(props.initial);
  const data = useQuery({
    queryKey: ["orders", props.orderId, "invoice-forms"],
    queryFn: () => unwrap(api.GET("/api/orders/{id}/invoice-forms", { params: { path: { id: props.orderId } } })),
  });
  const [rows, setRows] = useState<FormRow[] | null>(null);
  const history = useRef<FormRow[][]>([]);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [undoCount, setUndoCount] = useState(0);

  const save = useMutation({
    mutationFn: async (next: FormRow[]) => {
      await ensureCsrf();
      return unwrap(
        api.PUT("/api/orders/{id}/invoice-forms", {
          params: { path: { id: props.orderId } },
          body: { rows: next.map((r) => ({ ...r, total: undefined })) },
        }),
      );
    },
    onSuccess: (r) => {
      dirty.current = false;
      qc.setQueryData(["orders", props.orderId, "invoice-forms"], r);
    },
  });
  const revert = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      return unwrap(api.DELETE("/api/orders/{id}/invoice-forms", { params: { path: { id: props.orderId } } }));
    },
    onSuccess: (r) => {
      history.current = [];
      setUndoCount(0);
      dirty.current = false;
      setRows(r.rows);
      qc.setQueryData(["orders", props.orderId, "invoice-forms"], r);
    },
  });

  const f = data.data;
  const canEdit = !!f?.canEdit && !!f?.canSeePrices;
  const types = FORM_TYPES.filter((x) => !x.priced || f?.canSeePrices);
  const form = FORM_TYPES.find((x) => x.type === type) ?? FORM_TYPES[1];
  const current = useMemo(() => rows ?? data.data?.rows ?? [], [rows, data.data]);
  const changed = f ? changedCells(current, f.original) : 0;
  const sumQty = current.reduce((a, r) => a + r.qty, 0);
  const sum = current.reduce((a, r) => {
    const [i, d = ""] = rowTotal(r.qty, r.price).split(".");
    return a + BigInt(i) * 100n + BigInt((d + "00").slice(0, 2));
  }, 0n);
  const sumText = `${(sum / 100n).toString()}.${(sum % 100n).toString().padStart(2, "0")}`;

  function update(next: FormRow[]) {
    history.current.push(current);
    if (history.current.length > 100) history.current.shift();
    setUndoCount(history.current.length);
    setRows(next);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.mutate(next), 800);
  }

  function setCell(i: number, c: EditCol, v: string) {
    const next = current.map((r, j) => {
      if (j !== i) return r;
      if (c === "qty") return withTotal({ ...r, qty: Math.max(0, Number(v.replace(/\D/g, "").slice(0, 7)) || 0) });
      if (c === "price") return withTotal({ ...r, price: v.replace(",", ".").replace(/[^\d.]/g, "") || "0" });
      return { ...r, [c]: v };
    });
    update(next);
  }

  function undo() {
    const prev = history.current.pop();
    setUndoCount(history.current.length);
    if (!prev) return;
    setRows(prev);
    dirty.current = true;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save.mutate(prev), 800);
  }

  function move(i: number, d: -1 | 1) {
    const j = i + d;
    if (j < 0 || j >= current.length) return;
    const next = [...current];
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  }

  const dragFrom = useRef<number | null>(null);

  async function download() {
    if (timer.current) clearTimeout(timer.current);
    if (dirty.current && canEdit) await save.mutateAsync(current);
    window.open(`/api/orders/${props.orderId}/invoice-forms/${type}/xlsx`, "_blank", "noopener");
  }

  /** Excel kabi: Enter — pastdagi katak, ↑/↓ — qatorlar boʻylab; Ctrl+Z — bekor qilish. */
  function onKey(e: KeyboardEvent<HTMLInputElement>, i: number, c: EditCol) {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
      e.preventDefault();
      undo();
      return;
    }
    const down = e.key === "Enter" || e.key === "ArrowDown";
    const up = e.key === "ArrowUp";
    if (!down && !up) return;
    e.preventDefault();
    const target = document.querySelector<HTMLInputElement>(`[data-cell="${i + (down ? 1 : -1)}:${c}"]`);
    target?.focus();
  }

  return (
    <Modal
      open
      onClose={props.onClose}
      size="lg"
      title={t("title")}
      primaryAction={{ label: t("download"), onClick: () => void download(), loading: save.isPending, disabled: !f }}
      secondaryAction={{ label: t("close"), onClick: props.onClose }}
    >
      <div className="flex flex-col gap-3">
        <div role="tablist" aria-label={t("types")} className="flex flex-wrap gap-2">
          {types.map((x) => (
            <button
              key={x.type}
              type="button"
              role="tab"
              aria-selected={x.type === type}
              onClick={() => setType(x.type)}
              className={`rounded-full border px-3 py-1 text-caption ${x.type === type ? "border-primary bg-primary-soft text-primary" : "border-border"}`}
            >
              {x.title}
            </button>
          ))}
        </div>
        <Alert tone="info" title={t("note")} />
        {data.error ? (
          <ErrorState onRetry={() => data.refetch()} />
        ) : !f ? (
          <Skeleton className="h-40" />
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 text-caption text-text-secondary">
              <span aria-live="polite">
                {t("changed", { n: changed })}
                {f.edited && f.editedBy && f.editedAt
                  ? ` · ${t("savedBy", { who: f.editedBy, at: formatDateTime(new Date(f.editedAt)) })}`
                  : ""}
                {save.isPending ? ` · ${t("saving")}` : ""}
              </span>
              {canEdit ? (
                <span className="flex flex-wrap gap-2">
                  <Button size="sm" variant="tertiary" icon={Undo2} disabled={undoCount === 0} onClick={undo}>
                    {t("undo")}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={Plus}
                    onClick={() => update([...current, { name: t("newRow"), qty: 1, price: "0", total: "0.00" }])}
                  >
                    {t("addRow")}
                  </Button>
                  <Button
                    size="sm"
                    variant="tertiary"
                    icon={RotateCcw}
                    disabled={!f.edited}
                    loading={revert.isPending}
                    onClick={() => revert.mutate()}
                  >
                    {t("revert")}
                  </Button>
                </span>
              ) : null}
            </div>
            <div className="max-h-[50vh] overflow-auto rounded-card border border-border">
              <table className="w-full min-w-[880px] text-caption">
                <thead className="sticky top-0 bg-table-header">
                  <tr>
                    <th className="px-2 py-1 text-left">№</th>
                    {form.cols.map((c) => (
                      <th key={c} className={`px-2 py-1 ${c === "qty" || c === "price" || c === "total" ? "text-right" : "text-left"}`}>
                        {COL_TITLES[c]}
                      </th>
                    ))}
                    {canEdit ? <th className="px-2 py-1" aria-label={t("actions")} /> : null}
                  </tr>
                </thead>
                <tbody>
                  {current.map((r, i) => (
                    <tr
                      key={i}
                      className="border-t border-border"
                      onDragOver={canEdit ? (e) => e.preventDefault() : undefined}
                      onDrop={
                        canEdit
                          ? (e) => {
                              e.preventDefault();
                              const from = dragFrom.current;
                              dragFrom.current = null;
                              if (from != null && from !== i) update(moveRow(current, from, i));
                            }
                          : undefined
                      }
                    >
                      <td className="px-2 py-1 tabular-nums">
                        {canEdit ? (
                          <span
                            draggable
                            onDragStart={(e) => {
                              dragFrom.current = i;
                              e.dataTransfer.effectAllowed = "move";
                            }}
                            title={t("drag")}
                            className="inline-flex cursor-grab items-center gap-1 text-text-secondary"
                          >
                            <GripVertical size={14} strokeWidth={1.5} aria-hidden />
                            <span className="text-text-primary">{i + 1}</span>
                          </span>
                        ) : (
                          i + 1
                        )}
                      </td>
                      {form.cols.map((c) => {
                        if (c === "total")
                          return (
                            <td key={c} className="px-2 py-1 text-right tabular-nums">
                              {r.price == null ? "" : formatMoney(rowTotal(r.qty, r.price))}
                            </td>
                          );
                        const o = f.original[i];
                        const value = cellValue(r, c);
                        const was = o ? cellValue(o, c) : "";
                        const edited = value !== was;
                        return (
                          <td
                            key={c}
                            className={`px-1 py-0.5 ${edited ? "bg-warning-bg" : ""}`}
                            title={edited ? t("original", { v: was || "—" }) : undefined}
                          >
                            {canEdit ? (
                              <input
                                data-cell={`${i}:${c}`}
                                aria-label={`${COL_TITLES[c]} — ${i + 1}`}
                                value={c === "price" ? (r.price ?? "") : c === "qty" ? String(r.qty) : (r[c] ?? "")}
                                onChange={(e) => setCell(i, c, e.target.value)}
                                onKeyDown={(e) => onKey(e, i, c)}
                                inputMode={c === "qty" || c === "price" ? "decimal" : undefined}
                                className={`w-full rounded-control border border-transparent bg-transparent px-1 py-0.5 focus:border-primary focus:outline-none ${
                                  c === "qty" || c === "price" ? "text-right tabular-nums" : ""
                                }`}
                              />
                            ) : (
                              <span className={c === "qty" || c === "price" ? "block text-right tabular-nums" : ""}>
                                {c === "price" ? (r.price == null ? "" : formatMoney(r.price)) : value}
                              </span>
                            )}
                          </td>
                        );
                      })}
                      {canEdit ? (
                        <td className="px-1 py-0.5 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="icon"
                            icon={ArrowUp}
                            aria-label={t("up")}
                            disabled={i === 0}
                            onClick={() => move(i, -1)}
                          />
                          <Button
                            size="sm"
                            variant="icon"
                            icon={ArrowDown}
                            aria-label={t("down")}
                            disabled={i === current.length - 1}
                            onClick={() => move(i, 1)}
                          />
                          <Button
                            size="sm"
                            variant="icon"
                            icon={Trash2}
                            aria-label={t("deleteRow")}
                            onClick={() => update(current.filter((_, j) => j !== i))}
                          />
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-semibold">
                    <td className="px-2 py-1" colSpan={form.cols.indexOf("qty") + 1}>
                      Жами
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums">{sumQty}</td>
                    <td colSpan={form.cols.length - form.cols.indexOf("qty") - 2} />
                    {form.priced ? <td className="px-2 py-1 text-right tabular-nums">{formatMoney(sumText)}</td> : <td />}
                    {canEdit ? <td /> : null}
                  </tr>
                </tfoot>
              </table>
            </div>
            {save.error ? <p className="text-caption text-danger">{t("saveError")}</p> : null}
          </>
        )}
      </div>
    </Modal>
  );
}
