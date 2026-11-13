"use client";

import { Gift, Lock, ScanBarcode, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, type KeyboardEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { todayTashkent } from "@/features/counterparties/api";
import type { Zone } from "@/features/organization/api";
import { useThresholds } from "@/features/settings/thresholds";
import { ZONE_ICON } from "@/features/stock/zone-icon";
import { maskUzDate } from "@/lib/date-mask";
import { cn } from "@/lib/cn";
import { formatMoney, formatQuantity } from "@/lib/format";
import type { ReceiptDetail } from "./api";
import { EDIT_KEYS, expiryFlag, gridKeys, lineSum, nextCell, type GridKey, type GridMode } from "./receipt-lines";

/** Qoralama qatori (receipt-drawer DraftLine bilan bir xil). */
export interface GridLine {
  productId: number;
  productCode: string;
  productName: string;
  batchNumber: string;
  producedOn: string;
  expiryDate: string;
  zoneId: number;
  qty: string;
  bonusQty: string;
  price: string;
}

type ServerLine = ReceiptDetail["lines"][number];
type EditableKey = "batchNumber" | "expiryDate" | "qty" | "bonusQty" | "price";

const FIELD: Partial<Record<GridKey, EditableKey>> = {
  batch: "batchNumber",
  exp: "expiryDate",
  qty: "qty",
  bonusQty: "bonusQty",
  price: "price",
};
const WIDTH: Record<GridKey, string> = {
  product: "minmax(220px,1fr)",
  batch: "120px",
  exp: "150px",
  zone: "160px",
  qty: "88px",
  fact: "120px",
  diff: "150px",
  bonusQty: "96px",
  price: "124px",
  sum: "136px",
};
const RIGHT = new Set<GridKey>(["qty", "fact", "bonusQty", "price", "sum"]);
const REQUIRED = new Set<GridKey>(["product", "batch", "exp", "zone", "qty", "price"]);
const isInt = (s: string) => /^\d+$/.test(s.trim());

/**
 * Kirim qatorlari — prototip `DocumentLinesGrid` (Receipts): №, Mahsulot (yopishqoq; ishlab chiqaruvchi, nazorat/markirovka
 * belgisi), Partiya, Yaroqlilik (muddat belgisi), Zona (belgi + «sotuvga yopiq»), Soni, Fakt/Farq (qabuldan keyin), Bonus
 * (+N, «partiya-B»), Narx, Summa. Qoralamada kataklar joyida tahrirlanadi: Enter/Tab — keyingi katak, Shift — orqaga,
 * oxirgi katakda Enter — «Mahsulot qoʻshish».
 */
export function ReceiptLinesGrid({
  lines,
  server,
  mode,
  pricesVisible,
  zones,
  zoneName,
  fromBonus,
  emptyText,
  onChange,
  onRemove,
  onAdd,
}: {
  lines: GridLine[];
  server: ServerLine[];
  mode: GridMode;
  pricesVisible: boolean;
  zones: Zone[];
  zoneName: (id: number) => string;
  fromBonus: boolean;
  emptyText: string;
  onChange: (index: number, patch: Partial<GridLine>) => void;
  onRemove: (index: number) => void;
  onAdd?: () => void;
}) {
  const t = useTranslations("receipts.grid");
  const tr = useTranslations("receipts");
  const root = useRef<HTMLDivElement>(null);
  const hasFact = server.some((l) => l.receivedQty != null);
  const keys = gridKeys(mode, hasFact, pricesVisible);
  const editKeys = EDIT_KEYS.filter((k) => keys.includes(k));
  const editable = mode === "edit";
  const grid = `44px ${keys.map((k) => WIDTH[k]).join(" ")}${editable ? " 40px" : ""}`;
  const today = todayTashkent();
  const { expiryWarnDays } = useThresholds();
  const meta = (productId: number) => server.find((l) => l.productId === productId);

  function focus(row: number, key: GridKey) {
    const el = root.current?.querySelector<HTMLElement>(`[data-cell="${row}|${key}"]`);
    el?.focus();
    if (el instanceof HTMLInputElement) el.select();
  }

  function onKey(e: KeyboardEvent<HTMLElement>, row: number, key: GridKey) {
    if (e.key === "Escape") return (e.currentTarget as HTMLElement).blur();
    if ((e.key === "Delete" || e.key === "Backspace") && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      return onRemove(row);
    }
    if (e.key !== "Enter" && e.key !== "Tab") return;
    e.preventDefault();
    const next = nextCell(editKeys, lines.length, row, key, e.shiftKey ? -1 : 1);
    if (next) focus(next.row, next.key);
    else if (e.key === "Enter" && !e.shiftKey) onAdd?.();
  }

  const zoneOf = (id: number) => zones.find((z) => z.id === id);

  function view(l: GridLine, i: number, key: GridKey) {
    const s = server[i];
    switch (key) {
      case "product": {
        const m = meta(l.productId);
        return (
          <span className="flex min-w-0 flex-col">
            <span className="flex items-center gap-1.5 font-medium">
              <span className="truncate">{l.productName}</span>
              {m?.controlled ? (
                <Tooltip content={t("controlled")}>
                  <Lock aria-label={t("controlled")} className="size-3.5 shrink-0 text-danger" strokeWidth={1.5} />
                </Tooltip>
              ) : null}
              {m?.marked ? (
                <Tooltip content={t("marked")}>
                  <ScanBarcode aria-label={t("marked")} className="size-3.5 shrink-0 text-text-secondary" strokeWidth={1.5} />
                </Tooltip>
              ) : null}
              {fromBonus ? <Gift aria-label={t("fromBonus")} className="size-3.5 shrink-0 text-success" strokeWidth={1.5} /> : null}
            </span>
            <span className="truncate text-caption text-text-secondary">
              <span className="font-mono">{l.productCode}</span>
              {m?.manufacturer ? ` · ${m.manufacturer}` : ""}
            </span>
          </span>
        );
      }
      case "batch":
        return <span className="font-mono text-[12.5px]">{l.batchNumber || "—"}</span>;
      case "exp": {
        const f = expiryFlag(l.expiryDate, today, expiryWarnDays);
        return (
          <span className="flex flex-col gap-0.5">
            <span className="tabular-nums">{l.expiryDate || "—"}</span>
            {f ? (
              <Badge tone={f.kind === "expired" ? "danger" : "warning"}>
                {f.kind === "expired" ? t("expired") : t("days", { days: f.days })}
              </Badge>
            ) : null}
          </span>
        );
      }
      case "zone": {
        const z = zoneOf(l.zoneId);
        const type = z?.type ?? s?.zoneType;
        const Z = type ? ZONE_ICON[type] : null;
        return (
          <span className="flex flex-col">
            <span className="flex items-center gap-1.5">
              {Z ? <Z.icon className={cn("size-3.5 shrink-0", Z.cls)} strokeWidth={1.5} aria-hidden /> : null}
              <span className="truncate">{zoneName(l.zoneId) || "—"}</span>
            </span>
            {type === "RECEIVING" || type === "QUARANTINE" ? (
              <span className="text-caption text-text-secondary">{t("closedSale")}</span>
            ) : null}
          </span>
        );
      }
      case "qty":
        return <span className="font-medium tabular-nums">{isInt(l.qty) ? formatQuantity(Number(l.qty)) : l.qty || "0"}</span>;
      case "fact": {
        if (s?.receivedQty == null) return "—";
        const fact = s.receivedQty + (s.damagedQty ?? 0);
        const d = fact - s.qty;
        return (
          <span className="flex flex-col items-end">
            <span className={cn("font-semibold tabular-nums", d !== 0 && "text-warning")}>{formatQuantity(fact)}</span>
            {d !== 0 ? (
              <span className="text-caption tabular-nums text-warning">{`${d > 0 ? "+" : "−"}${formatQuantity(Math.abs(d))}`}</span>
            ) : null}
            {s.damagedQty ? (
              <span className="text-caption tabular-nums text-text-secondary">{t("damaged", { qty: formatQuantity(s.damagedQty) })}</span>
            ) : null}
          </span>
        );
      }
      case "diff":
        return s?.diffReason ? <span className="text-warning">{tr(`diff.${s.diffReason}`)}</span> : "—";
      case "bonusQty":
        return l.bonusQty && l.bonusQty !== "0" ? (
          <span className="flex flex-col items-end">
            <span className="font-medium tabular-nums text-success">
              +{isInt(l.bonusQty) ? formatQuantity(Number(l.bonusQty)) : l.bonusQty}
            </span>
            {l.batchNumber ? <span className="font-mono text-caption text-success">{s?.bonusBatch ?? `${l.batchNumber}-B`}</span> : null}
          </span>
        ) : (
          <span className="text-text-secondary">0</span>
        );
      case "price":
        return lineSum(l.price, "1") ? (
          <span className="tabular-nums">{formatMoney(lineSum(l.price, "1")!)}</span>
        ) : (
          <span className="text-text-secondary">0,00</span>
        );
      case "sum": {
        const sum = lineSum(l.price, l.qty);
        return sum ? <span className="font-medium tabular-nums">{formatMoney(sum)}</span> : <span className="text-text-secondary">—</span>;
      }
    }
  }

  function cell(l: GridLine, i: number, key: GridKey) {
    const field = FIELD[key];
    if (editable && field) {
      const value = l[field];
      const bad =
        (key === "qty" && value !== "" && (!isInt(value) || Number(value) < 1)) ||
        (key === "bonusQty" && value !== "" && !isInt(value)) ||
        (key === "price" && value !== "" && !lineSum(value, "1")) ||
        (key === "batch" && !value.trim());
      return (
        <input
          data-cell={`${i}|${key}`}
          aria-label={t("cell", { col: t(`col.${key}`), n: i + 1 })}
          value={key === "price" ? value.replace(/^(\d+)\.(\d+)$/, "$1,$2") : value}
          inputMode={key === "batch" ? "text" : key === "exp" ? "numeric" : "decimal"}
          placeholder={key === "exp" ? t("datePh") : key === "price" ? "0,00" : key === "batch" ? "" : "0"}
          onChange={(e) => onChange(i, { [field]: key === "exp" ? maskUzDate(e.target.value, value) : e.target.value })}
          onKeyDown={(e) => onKey(e, i, key)}
          className={cn(
            "h-full w-full bg-transparent px-3 outline-none focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--color-primary)]",
            RIGHT.has(key) && "text-right tabular-nums",
            key === "batch" && "font-mono text-[12.5px]",
            bad && "shadow-[inset_0_0_0_1px_var(--color-danger)]",
          )}
        />
      );
    }
    if (editable && key === "zone") {
      return (
        <select
          data-cell={`${i}|zone`}
          aria-label={t("cell", { col: t("col.zone"), n: i + 1 })}
          value={String(l.zoneId)}
          onChange={(e) => onChange(i, { zoneId: Number(e.target.value) })}
          onKeyDown={(e) => onKey(e, i, "zone")}
          className="h-full w-full bg-transparent px-2 outline-none focus:bg-surface focus:shadow-[inset_0_0_0_2px_var(--color-primary)]"
        >
          {zones.map((z) => (
            <option key={z.id} value={z.id}>
              {z.name}
            </option>
          ))}
        </select>
      );
    }
    return (
      <div className={cn("flex h-full flex-col justify-center px-3 py-2", RIGHT.has(key) && "items-end text-right")}>{view(l, i, key)}</div>
    );
  }

  return (
    <div ref={root} className="overflow-x-auto rounded-card border border-border bg-surface text-table">
      <div style={{ minWidth: 80 + keys.reduce((a, k) => a + (parseInt(WIDTH[k].replace("minmax(", ""), 10) || 120), 0) }}>
        <div
          role="row"
          className="grid h-[38px] border-b border-border bg-table-header text-text-secondary"
          style={{ gridTemplateColumns: grid }}
        >
          <div className="flex items-center justify-center font-medium">№</div>
          {keys.map((k) => (
            <div
              key={k}
              role="columnheader"
              className={cn(
                "flex items-center px-3 font-medium",
                RIGHT.has(k) && "justify-end",
                k === "product" && "sticky left-[44px] z-[1] bg-table-header",
              )}
            >
              {t(`col.${k}`)}
              {editable && REQUIRED.has(k) ? <span className="ml-0.5 text-danger">*</span> : null}
            </div>
          ))}
          {editable ? <div /> : null}
        </div>
        {lines.length === 0 ? (
          <p className="px-3 py-6 text-center text-text-secondary">{emptyText}</p>
        ) : (
          lines.map((l, i) => (
            <div
              key={`${l.productId}-${i}`}
              role="row"
              className="group grid min-h-[48px] border-b border-border last:border-b-0 hover:bg-background"
              style={{ gridTemplateColumns: grid }}
            >
              <div className="flex items-center justify-center tabular-nums text-text-secondary">{i + 1}</div>
              {keys.map((k) => (
                <div key={k} className={cn("min-w-0", k === "product" && "sticky left-[44px] z-[1] bg-surface group-hover:bg-background")}>
                  {cell(l, i, k)}
                </div>
              ))}
              {editable ? (
                <div className="flex items-center justify-center">
                  <Button variant="icon" icon={Trash2} aria-label={t("remove")} onClick={() => onRemove(i)} />
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
