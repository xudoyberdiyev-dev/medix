"use client";

import { CalendarClock, CircleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { useBranchList, useWarehouses, zoneLabel } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { KIND_PAGE } from "@/features/transfers/model";
import { linesFrom, type ZoneStockRow } from "@/features/zone-transfers/api";
import { useLineErrorText } from "@/features/zone-transfers/line-error";
import { formatDate, formatQuantity } from "@/lib/format";
import { useBuyerWarehouses, useCreateBranchSale, useSellerZoneStock, useUpdateBranchSale } from "@/features/branch-sales/api";
import { useCreateWarehouseTransfer, useSourceZoneStock, useUpdateWarehouseTransfer } from "./api";
import { draftKey, draftOf, fefo, type DraftDoc, type OkDraft } from "./doc-model";
import { InfoRow, SideCard, ZoneCell } from "./transfer-doc-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export type SaveState = { save: "idle" | "saving" | "saved" | "error"; savedAt: string; dirty: boolean };

/** Avtomatik saqlash belgisi (sarlavha ostida). */
export function AutosaveNote({ state }: { state: SaveState }) {
  const t = useTranslations("warehouseTransfers.edit");
  if (state.save === "saving") return <span className="text-caption text-text-secondary">{t("saving")}</span>;
  if (state.save === "error")
    return (
      <span className="inline-flex items-center gap-1 text-caption text-danger">
        <CircleAlert size={12} strokeWidth={1.5} aria-hidden />
        {t("saveErr")}
      </span>
    );
  if (state.save === "saved") return <span className="text-caption text-text-secondary">{t("saved", { t: state.savedAt })}</span>;
  return null;
}

/**
 * OK qoralamasi — tahrirlash (prototip `TransferDoc`, editable): Turi, Qayerdan (ombor + zona), Qayerga, izoh; manba zona partiyalari
 * FEFO tartibida, joʻnatish soni; oʻzgarish 0,8 s dan keyin avtomatik saqlanadi (yangi — yaratiladi va hujjat sahifasiga oʻtiladi).
 */
export function OkDraftForm({
  doc,
  onState,
  kind = "OK",
}: {
  doc: DraftDoc | null;
  onState: (s: SaveState) => void;
  /** OK — filial ichida; FS — boshqa filial ombori (xaridor), hisob-faktura joʻnatishda. */
  kind?: "OK" | "FS";
}) {
  const fs = kind === "FS";
  const tb = useTranslations("branchSales");
  const t = useTranslations("warehouseTransfers.edit");
  const tf = useTranslations("warehouseTransfers.form");
  const td = useTranslations("warehouseTransfers.doc");
  const tw = useTranslations("warehouseTransfers");
  const tk = useTranslations("transfers.kind");
  const lineError = useLineErrorText();
  const router = useRouter();
  const warehouses = useWarehouses();
  const branches = useBranchList();
  const okCreate = useCreateWarehouseTransfer();
  const okUpdate = useUpdateWarehouseTransfer();
  const fsCreate = useCreateBranchSale();
  const fsUpdate = useUpdateBranchSale();
  const busy = okCreate.isPending || okUpdate.isPending || fsCreate.isPending || fsUpdate.isPending;
  const [warehouseId, setWarehouseId] = useState<string | null>(doc ? String(doc.fromWarehouse.id) : null);
  const [fromId, setFromId] = useState<string | null>(doc ? String(doc.fromZone.id) : null);
  const [toId, setToId] = useState<string | null>(doc ? String(doc.toWarehouse.id) : null);
  const [note, setNote] = useState(doc?.note ?? "");
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries((doc?.lines ?? []).map((l) => [l.batchId, String(l.qty)])),
  );
  const [savedKey, setSavedKey] = useState<string | null>(doc ? draftKey(draftOf(doc)) : null);
  const [save, setSave] = useState<SaveState["save"]>(doc ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState(doc ? new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }) : "");
  const [error, setError] = useState<string | null>(null);
  const okStock = useSourceZoneStock(!fs && fromId ? Number(fromId) : null);
  const fsStock = useSellerZoneStock(fs && fromId ? Number(fromId) : null);
  const stock = fs ? fsStock : okStock;

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const buyers = useBuyerWarehouses(fs && warehouse ? warehouse.branchId : null);
  const targets: { id: number; name: string; branchId: number }[] = fs
    ? (buyers.data ?? []).map((w) => ({ id: w.id, name: w.name, branchId: w.branch.id }))
    : active.filter((w) => warehouse && w.id !== warehouse.id && w.branchId === warehouse.branchId);
  const zones = warehouse?.zones ?? [];
  const from = zones.find((z) => String(z.id) === fromId);
  const to = targets.find((w) => String(w.id) === toId);
  const rows = useMemo(() => fefo(stock.data ?? []), [stock.data]);
  const picked = linesFrom(rows, qty);
  const branchName = (id?: number) =>
    branches.data?.find((b) => b.id === id)?.name ?? buyers.data?.find((w) => w.branch.id === id)?.branch.name ?? "";
  const place = (w?: { name: string; branchId: number }) => (w ? [branchName(w.branchId), w.name].filter(Boolean).join(" · ") : "—");

  const draft: OkDraft | null =
    from && toId && stock.data && !picked.error && picked.lines.length
      ? { fromZoneId: from.id, toWarehouseId: Number(toId), note: note.trim(), lines: picked.lines }
      : null;
  const key = draftKey(draft);
  const dirty = key !== null && key !== savedKey;

  useEffect(() => onState({ save, savedAt, dirty: dirty || busy }), [onState, save, savedAt, dirty, busy]);

  useEffect(() => {
    if (!dirty || busy) return;
    const d = draft;
    const k = key;
    const h = setTimeout(() => {
      if (!d || !k) return;
      setSave("saving");
      const ok = () => {
        setSavedKey(k);
        setSave("saved");
        setSavedAt(new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" }));
        setError(null);
      };
      const fail = (e: unknown) => (setSave("error"), setError(describeError(e).message ?? tw("saveFailed")));
      const created = (id: number) => (ok(), router.replace(`${fs ? "/branch-sales" : "/warehouse-transfers"}/${id}`));
      if (fs) {
        if (doc) fsUpdate.mutate({ id: doc.id, body: d }, { onSuccess: ok, onError: fail });
        else fsCreate.mutate(d, { onSuccess: (r) => created(r.id), onError: fail });
      } else if (doc) okUpdate.mutate({ id: doc.id, body: d }, { onSuccess: ok, onError: fail });
      else okCreate.mutate(d, { onSuccess: (r) => created(r.id), onError: fail });
    }, 800);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat kalit oʻzgarganda
  }, [key, dirty, busy]);

  const hint = !from || !toId ? tf("pickZones") : picked.error ? lineError(picked.error) : picked.lines.length === 0 ? tf("noLines") : null;
  const total = picked.lines.reduce((s, l) => s + l.qty, 0);

  const columns: TableColumn<ZoneStockRow>[] = [
    {
      key: "productName",
      title: td("cProduct"),
      wrap: true,
      render: (r) => (
        <span className="flex min-w-0 flex-col">
          <span className="font-medium">{r.productName}</span>
          <span className="font-mono text-caption text-text-secondary">{r.productCode}</span>
        </span>
      ),
    },
    { key: "batchNumber", title: td("cBatch"), mono: true },
    { key: "expiryDate", title: td("cExpiry"), render: (r) => day(r.expiryDate) },
    { key: "fromZone", title: td("cFromZone"), render: () => (from ? <ZoneCell name={from.name} /> : "—") },
    {
      key: "free",
      title: t("cAvail"),
      align: "right",
      render: (r) => (
        <span className="flex flex-col items-end tabular-nums">
          {formatQuantity(r.free)}
          {r.reserved ? <span className="text-caption text-text-secondary">{t("reserved", { q: formatQuantity(r.reserved) })}</span> : null}
        </span>
      ),
    },
    {
      key: "move",
      title: td("cQty"),
      align: "right",
      render: (r) => (
        <div className="ml-auto w-28">
          <TextField
            label={tf("qtyLabel", { product: r.productName, batch: r.batchNumber })}
            className="[&>label]:sr-only"
            value={qty[r.batchId] ?? ""}
            onChange={(v) => setQty((q) => ({ ...q, [r.batchId]: v }))}
            placeholder={r.free > 0 ? `≤ ${r.free}` : "0"}
            disabled={r.free === 0 && !qty[r.batchId]}
            inputMode="numeric"
          />
        </div>
      ),
    },
    { key: "toZone", title: td("cToZone"), render: () => <span className="text-text-secondary">{td("toZoneOnReceive")}</span> },
  ];

  return (
    <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={tf("errorTitle")}>
            {error}
          </Alert>
        ) : null}
        <section className="rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-5 py-4 text-subtitle">{td("info")}</h2>
          <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3">
            <Select
              label={td("hKind")}
              value={kind}
              onChange={(v) => (v && v !== kind ? router.push(`${KIND_PAGE[v as "ZK" | "OK" | "FS"]}/new`) : undefined)}
              options={(["ZK", "OK", "FS"] as const).map((k) => ({ value: k, label: tk(k) }))}
              disabled={doc !== null}
              hint={doc ? t("kindLocked") : undefined}
              required
            />
            <Select
              label={tf("fromWarehouse")}
              value={warehouseId}
              onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
              options={active.map((w) => ({ value: String(w.id), label: w.name, sub: branchName(w.branchId) }))}
              required
            />
            <Select
              label={tf("zone")}
              value={fromId}
              onChange={(v) => (setFromId(v), setQty({}))}
              options={zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${zoneLabel(z.type)}` }))}
              disabled={!warehouse}
              required
            />
            <Select
              label={fs ? tb("form.buyerWarehouse") : tf("toWarehouse")}
              value={toId}
              onChange={setToId}
              options={targets.map((w) => ({ value: String(w.id), label: w.name, sub: branchName(w.branchId) }))}
              disabled={!warehouse}
              required
            />
            <div className="md:col-span-2">
              <TextField label={tf("note")} value={note} onChange={setNote} placeholder={tf("notePlaceholder")} />
            </div>
          </div>
          <dl className="flex flex-col border-t border-border px-5 py-2">
            <InfoRow k={td("hDate")} v={formatDate(doc ? new Date(doc.createdAt) : new Date())} />
            {doc ? <InfoRow k={td("hBy")} v={doc.createdBy} /> : null}
          </dl>
        </section>
        {warehouse && targets.length === 0 && (!fs || buyers.data) ? (
          <Alert tone="info" title={fs ? tb("form.noTargetsTitle") : tf("noTargetsTitle")}>
            {fs ? tb("form.noTargetsBody", { ok: "OK" }) : tf("noTargetsBody", { fs: "FS" })}
          </Alert>
        ) : null}
        {fs ? <Alert tone="info" title={tb("form.priceNote")} /> : null}
        <section className="rounded-card border border-border bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
            <h2 className="flex items-center gap-2 text-subtitle">
              {td("lines")}
              <span className="font-normal text-text-secondary">{picked.lines.length}</span>
            </h2>
            <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
              <CalendarClock size={14} strokeWidth={1.5} aria-hidden />
              {t("fefoHint")}
            </span>
          </div>
          {!from ? (
            <EmptyState icon={X} title={t("pickFromTitle")} description={t("pickFromHint")} />
          ) : stock.error ? (
            <ErrorState onRetry={() => stock.refetch()} />
          ) : (
            <Table
              caption={tf("stockCaption", { zone: from.name })}
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.batchId)}
              loading={stock.isPending}
              emptyState={<EmptyState icon={X} title={tf("emptyZoneTitle")} description={tf("emptyZoneHint")} />}
            />
          )}
          {hint && (from || warehouse) ? <p className="px-5 py-3 text-caption text-text-secondary">{hint}</p> : null}
        </section>
      </div>
      <aside className="flex min-w-0 flex-col gap-3">
        <SideCard label={td("sLines")} value={formatQuantity(picked.lines.length)} />
        <SideCard label={td("sQty")} value={formatQuantity(total)} />
        <SideCard
          label={td("sSender")}
          value="—"
          note={warehouse ? `${place(warehouse)}${from ? ` · ${from.name}` : ""}` : undefined}
          muted
        />
        <SideCard label={td("sReceiver")} value="—" note={to ? place(to) : undefined} muted />
      </aside>
    </div>
  );
}
