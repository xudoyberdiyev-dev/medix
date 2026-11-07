"use client";

import { Check, CircleAlert, Download, FileSpreadsheet, Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useWarehouses, ZONE_LABELS } from "@/features/organization/api";
import { searchProducts } from "@/features/prices/api";
import { describeError } from "@/features/setup/form-error";
import { formatMoney, formatQuantity } from "@/lib/format";
import {
  OPENING_APPROVE,
  OPENING_CANCEL,
  duplicateKey,
  lineTotal,
  tiyinToMoney,
  uploadOpening,
  useCancelOpening,
  useOpening,
  usePostOpening,
  useSaveOpening,
  type DraftLine,
  type OpeningDetail,
  type OpeningImportResult,
} from "./api";
import { OpeningStatusBadge } from "./opening-page";

export function OpeningDrawer(props: { id: number | null; canEdit: boolean; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("opening");
  const KIND = t("title");
  const doc = useOpening(props.id);
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="BQ">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title={t("drawer.loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  const d = doc.data ?? null;
  // Import yoki saqlashdan keyin qatorlar serverdan qayta oʻqiladi — muharrir yangidan quriladi.
  return <Editor key={d ? `${d.id}-${d.status}-${d.lines.length}-${d.fileName ?? ""}` : "new"} doc={d} {...props} />;
}

function toDraft(d: OpeningDetail): DraftLine[] {
  return d.lines.map((l) => ({
    productId: l.productId,
    productCode: l.productCode,
    productName: l.productName,
    zoneId: l.zoneId,
    batchNumber: l.batchNumber,
    producedOn: formatIsoDate(l.producedOn),
    expiryDate: formatIsoDate(l.expiryDate),
    cost: l.cost ?? "0",
    bonus: l.bonus,
    qty: String(l.qty),
  }));
}

const emptyAdd = {
  product: null as string | null,
  zone: null as string | null,
  batch: "",
  produced: "",
  expiry: "",
  cost: "",
  qty: "",
  bonus: false,
};

function Editor({
  doc,
  canEdit,
  onClose,
  onCreated,
}: {
  doc: OpeningDetail | null;
  canEdit: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("opening");
  const KIND = t("title");
  const me = useMe();
  const warehouses = useWarehouses();
  const save = useSaveOpening();
  const post = usePostOpening();
  const cancel = useCancelOpening();
  const editable = canEdit && (!doc || doc.status === "DRAFT");
  const canPost = can(me.data, OPENING_APPROVE);
  const canCancelPosted = can(me.data, OPENING_CANCEL);
  const [warehouseId, setWarehouseId] = useState<string | null>(doc ? String(doc.warehouseId) : null);
  const [date, setDate] = useState(formatIsoDate(doc?.cutoffDate ?? todayTashkent()));
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(doc ? toDraft(doc) : []);
  const [adding, setAdding] = useState(emptyAdd);
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "import" | null>(null);
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const err = describeError(save.error ?? post.error);

  const activeWarehouses = (warehouses.data ?? []).filter((w) => w.active || String(w.id) === warehouseId);
  const warehouse = activeWarehouses.find((w) => String(w.id) === warehouseId) ?? null;
  const zones = warehouse?.zones ?? [];
  const zoneName = (id: number) => warehouse?.zones.find((z) => z.id === id)?.name ?? doc?.lines.find((l) => l.zoneId === id)?.zone ?? "";
  const showCost = !doc || doc.totalCost != null;
  const today = todayTashkent();

  let total = 0n;
  let qtyTotal = 0;
  for (const l of lines) {
    const c = l.bonus ? "0" : parseMoneyInput(l.cost);
    const q = Number(l.qty);
    if (c && Number.isInteger(q)) {
      total += lineTotal(c, q);
      qtyTotal += q;
    }
  }
  const cutoffIso = parseUzDate(date);
  const expiredCount = lines.filter((l) => {
    const e = parseUzDate(l.expiryDate);
    return e && cutoffIso && e < cutoffIso;
  }).length;

  function body() {
    if (!warehouse) return (setLocal(t("errors.warehouse")), null);
    const iso = parseUzDate(date);
    if (!iso) return (setLocal(t("errors.cutoffFormat")), null);
    if (iso > today) return (setLocal(t("errors.cutoffFuture")), null);
    const out = [];
    for (const [i, l] of lines.entries()) {
      const where = t("errors.where", { row: String(i + 1), name: l.productName });
      const expiry = parseUzDate(l.expiryDate);
      if (!expiry) return (setLocal(t("errors.lineExpiry", { where })), null);
      const produced = parseUzDate(l.producedOn);
      if (produced === null) return (setLocal(t("errors.lineProduced", { where })), null);
      const cost = l.bonus ? "0" : parseMoneyInput(l.cost);
      if (!cost) return (setLocal(t("errors.lineCost", { where })), null);
      const qty = Number(l.qty);
      if (!/^\d+$/.test(l.qty.trim()) || qty < 1) return (setLocal(t("errors.lineQty", { where })), null);
      out.push({
        productId: l.productId,
        zoneId: l.zoneId,
        batchNumber: l.batchNumber.trim(),
        producedOn: produced,
        expiryDate: expiry,
        cost,
        bonus: l.bonus,
        qty,
      });
    }
    setLocal(null);
    return { branchId: warehouse.branchId, warehouseId: warehouse.id, cutoffDate: iso, note: note.trim() || undefined, lines: out };
  }

  function saveDraft(then?: (id: number) => void) {
    const b = body();
    if (!b) return;
    save.mutate(
      { id: doc?.id, body: b },
      {
        onSuccess: (d) => {
          if (then) return then(d.id);
          toast({ tone: "success", title: t("drawer.draftSaved"), description: d.number });
          if (!doc) onCreated(d.id);
        },
      },
    );
  }

  function addLine() {
    const label = adding.product ? seen.current.get(adding.product) : undefined;
    if (!adding.product || !label) return setLocal(t("errors.product"));
    if (!adding.zone) return setLocal(t("errors.zone"));
    if (!adding.batch.trim()) return setLocal(t("errors.batch"));
    if (!parseUzDate(adding.expiry)) return setLocal(t("errors.expiry"));
    if (!adding.bonus && !parseMoneyInput(adding.cost)) return setLocal(t("errors.cost"));
    if (!/^\d+$/.test(adding.qty.trim()) || Number(adding.qty) < 1) return setLocal(t("errors.qty"));
    const line: DraftLine = {
      productId: Number(adding.product),
      productCode: label.code,
      productName: label.name,
      zoneId: Number(adding.zone),
      batchNumber: adding.batch.trim(),
      producedOn: adding.produced.trim(),
      expiryDate: adding.expiry.trim(),
      cost: adding.bonus ? "0" : (parseMoneyInput(adding.cost) ?? ""),
      bonus: adding.bonus,
      qty: adding.qty.trim(),
    };
    if (lines.some((l) => duplicateKey(l) === duplicateKey(line))) return setLocal(t("errors.duplicate"));
    setLines((ls) => [...ls, line]);
    // Keyingi qator koʻpincha shu zona va shu mahsulotning boshqa partiyasi.
    setAdding({ ...emptyAdd, zone: adding.zone });
    setLocal(null);
  }

  const actions = (
    <>
      {doc && ((doc.status === "DRAFT" && canEdit) || (doc.status === "POSTED" && canCancelPosted)) ? (
        <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
          {t("drawer.cancelDoc")}
        </Button>
      ) : null}
      <Button variant="secondary" onClick={onClose}>
        {t("drawer.back")}
      </Button>
      {editable ? (
        <>
          <Button variant={canPost ? "secondary" : "primary"} loading={save.isPending && !post.isPending} onClick={() => saveDraft()}>
            {t("drawer.saveDraft")}
          </Button>
          {canPost ? (
            <Button
              icon={Check}
              loading={post.isPending}
              onClick={() =>
                saveDraft((id) =>
                  post.mutate(id, {
                    onSuccess: (d) => {
                      toast({
                        tone: "success",
                        title: t("drawer.posted"),
                        description: t("drawer.postedDescription", { number: d.number, qty: formatQuantity(d.totalQty) }),
                      });
                      if (!doc) onCreated(d.id);
                    },
                    onError: () => {
                      if (!doc) onCreated(id);
                    },
                  }),
                )
              }
            >
              {t("drawer.post")}
            </Button>
          ) : null}
        </>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={doc ? `${KIND} · ${doc.createdBy}` : KIND}
      title={doc ? doc.number : t("drawer.newTitle")}
      subtitle={doc?.fileName ? t("drawer.excelFile", { name: doc.fileName }) : undefined}
      status={doc ? <OpeningStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        {doc?.status === "CANCELLED" && doc.cancelReason ? (
          <Alert tone="info" title={t("drawer.cancelledReason", { reason: doc.cancelReason })}>
            {doc.cancelledBy}
          </Alert>
        ) : null}
        {doc?.status === "POSTED" ? (
          <Alert tone="success" title={t("drawer.postedTitle")}>
            {t("drawer.postedHint")}
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-4">
          <Select
            label={t("drawer.warehouse")}
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setLines([]), setAdding(emptyAdd))}
            disabled={!editable || (doc !== null && lines.length > 0)}
            options={activeWarehouses.map((w) => ({ value: String(w.id), label: w.name }))}
            hint={editable && doc && lines.length > 0 ? t("drawer.warehouseLocked") : undefined}
            required
          />
          <TextField
            label={t("drawer.cutoffDate")}
            value={date}
            onChange={setDate}
            placeholder={t("drawer.datePlaceholder")}
            disabled={!editable}
            required
          />
          <TextField
            label={t("drawer.note")}
            value={note}
            onChange={setNote}
            disabled={!editable}
            placeholder={t("drawer.notePlaceholder")}
          />
        </div>

        {editable && warehouse ? (
          <div className="grid grid-cols-4 items-end gap-3 rounded-card border border-border p-3">
            <Select
              label={t("drawer.product")}
              value={adding.product}
              loadOptions={async (q) => {
                const found = await searchProducts(q);
                found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                return found;
              }}
              onChange={(v) => setAdding((a) => ({ ...a, product: v }))}
              placeholder={t("drawer.productPlaceholder")}
              options={[]}
              className="col-span-3"
            />
            <Select
              label={t("drawer.zone")}
              value={adding.zone}
              onChange={(v) => setAdding((a) => ({ ...a, zone: v }))}
              options={zones.map((z) => ({ value: String(z.id), label: z.name, sub: ZONE_LABELS[z.type] }))}
            />
            <TextField label={t("drawer.batch")} value={adding.batch} onChange={(v) => setAdding((a) => ({ ...a, batch: v }))} />
            <TextField
              label={t("drawer.produced")}
              value={adding.produced}
              onChange={(v) => setAdding((a) => ({ ...a, produced: v }))}
              placeholder="KK.OO.YYYY"
            />
            <TextField
              label={t("drawer.expiry")}
              value={adding.expiry}
              onChange={(v) => setAdding((a) => ({ ...a, expiry: v }))}
              placeholder="KK.OO.YYYY"
            />
            <TextField
              label={t("drawer.qty")}
              value={adding.qty}
              onChange={(v) => setAdding((a) => ({ ...a, qty: v }))}
              inputMode="numeric"
              suffix={t("drawer.unit")}
            />
            <TextField
              label={t("drawer.cost")}
              value={adding.bonus ? "0" : adding.cost}
              onChange={(v) => setAdding((a) => ({ ...a, cost: v }))}
              inputMode="decimal"
              suffix={t("drawer.currency")}
              disabled={adding.bonus}
              className="col-span-2"
            />
            <Checkbox
              label={t("drawer.bonusBatch")}
              description={t("drawer.bonusHint")}
              checked={adding.bonus}
              onChange={(v) => setAdding((a) => ({ ...a, bonus: v }))}
            />
            <Button variant="secondary" onClick={addLine}>
              {t("drawer.addLine")}
            </Button>
          </div>
        ) : null}

        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {expiredCount > 0 ? (
          <Alert tone="warning" title={t("drawer.expiredCount", { count: expiredCount })}>
            {t("drawer.expiredHint")}
          </Alert>
        ) : null}

        <div className="flex items-center justify-between gap-3">
          <h3 className="text-subtitle">
            {t("drawer.lines", { count: formatQuantity(lines.length) })}
            <span className="ml-3 text-body font-normal text-text-secondary">
              {t("drawer.linesQty", { qty: formatQuantity(qtyTotal) })}
              {showCost ? ` · ${t("drawer.linesSum", { sum: formatMoney(tiyinToMoney(total)) })}` : ""}
            </span>
          </h3>
          {editable && doc ? (
            <Button variant="tertiary" icon={Upload} onClick={() => setDialog("import")}>
              {t("drawer.importExcel")}
            </Button>
          ) : null}
        </div>
        {editable && !doc ? <p className="text-caption text-text-secondary">{t("drawer.importAfterSave")}</p> : null}
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t("drawer.product")}</th>
                <th className="px-3 py-2 font-medium">{t("drawer.zone")}</th>
                <th className="px-3 py-2 font-medium">{t("drawer.batch")}</th>
                <th className="px-3 py-2 font-medium">{t("drawer.expiry")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("drawer.qty")}</th>
                {showCost ? <th className="px-3 py-2 text-right font-medium">{t("drawer.costColumn")}</th> : null}
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                    {editable ? (warehouse ? t("drawer.noLinesHint") : t("drawer.chooseWarehouseFirst")) : t("drawer.noLines")}
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const e = parseUzDate(l.expiryDate);
                  const expired = Boolean(e && cutoffIso && e < cutoffIso);
                  return (
                    <tr key={`${duplicateKey(l)}-${i}`} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                      </td>
                      <td className="px-3 py-2">{zoneName(l.zoneId)}</td>
                      <td className="px-3 py-2 font-mono">
                        <span className="flex items-center gap-2">
                          {l.batchNumber}
                          {l.bonus ? <Badge tone="info">{t("drawer.bonus")}</Badge> : null}
                        </span>
                      </td>
                      <td className="px-3 py-2 tabular-nums">
                        {expired ? (
                          <Badge tone="danger" icon={CircleAlert}>
                            {t("drawer.expired", { date: l.expiryDate })}
                          </Badge>
                        ) : (
                          l.expiryDate
                        )}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{/^\d+$/.test(l.qty) ? formatQuantity(Number(l.qty)) : l.qty}</td>
                      {showCost ? (
                        <td className="px-3 py-2 text-right tabular-nums">
                          {parseMoneyInput(l.cost) ? formatMoney(parseMoneyInput(l.cost)!) : l.cost}
                        </td>
                      ) : null}
                      {editable ? (
                        <td className="px-1">
                          <Button
                            variant="icon"
                            icon={Trash2}
                            aria-label={t("drawer.removeLine")}
                            onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                          />
                        </td>
                      ) : null}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
      {dialog === "import" && doc ? <ImportDialog id={doc.id} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" && doc ? (
        <DeactivateDialog
          title={t("drawer.cancelTitle", { number: doc.number })}
          consequence={doc.status === "POSTED" ? t("drawer.cancelPosted") : t("drawer.cancelDraft")}
          actionLabel={t("drawer.cancelDoc")}
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: doc.id, reason },
              { onSuccess: () => (toast({ tone: "success", title: t("drawer.cancelled"), description: doc.number }), setDialog(null)) },
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

/** Excelʼdan qatorlar: avval tekshiriladi, xato boʻlmasa — qoralama qatorlari almashtiriladi (hammasi yoki hech narsa). */
function ImportDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useTranslations("opening.import");
  const input = useRef<HTMLInputElement>(null);
  const reload = useOpening(id);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<OpeningImportResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const err = describeError(error);
  const ready = result !== null && result.errors.length === 0 && result.rows > 0;

  async function run(apply: boolean) {
    if (!file) return;
    setPending(true);
    setError(null);
    try {
      const r = await uploadOpening(id, file, apply);
      setResult(r);
      if (r.applied) {
        toast({ tone: "success", title: t("loaded"), description: t("loadedDescription", { count: formatQuantity(r.rows) }) });
        await reload.refetch();
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
          ? { label: t("apply", { count: formatQuantity(result.rows) }), loading: pending, onClick: () => run(true) }
          : { label: t("check"), loading: pending, disabled: !file, onClick: () => run(false) }
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-text-secondary">{t("help")}</p>
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
          <a
            href="/api/opening-balances/import-template"
            className="ml-auto inline-flex items-center gap-1 text-primary hover:underline"
            download
          >
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
                    <span className="w-20 shrink-0 font-mono text-text-secondary">{t("row", { row: String(e.row) })}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <Alert tone="success" title={t("ok", { count: formatQuantity(result.rows) })} />
          )
        ) : null}
      </div>
    </Modal>
  );
}
