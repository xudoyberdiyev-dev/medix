"use client";

import { Calculator, Check, Printer, Trash2, TriangleAlert, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Radio } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent, usePriceTypes } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { describeError } from "@/features/setup/form-error";
import { formatDate, formatMoney } from "@/lib/format";
import {
  PRICE_BELOW,
  batchLines,
  computeMarkup,
  fetchReceiptBatches,
  lineKey,
  percentChange,
  searchPostedReceipts,
  searchProducts,
  useApprove,
  useCancel,
  usePriceChange,
  useReject,
  useSaveDraft,
  useSubmit,
  type DraftLine,
  type MarkupBase,
  type PriceChangeDetail,
} from "./api";
import { StatusBadge } from "./prices-page";
import { useThresholds } from "@/features/settings/thresholds";

export function PriceChangeDrawer(props: {
  id: number | null;
  branchId: number;
  preset?: DraftLine[];
  /** Yangi hujjat rejimi (masalan, «Narx oʻrnatish» sahifasidan «Kirim boʻyicha»). */
  initialMode?: "PRODUCT" | "RECEIPT";
  canSet: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("prices.drawer");
  const tc = useTranslations("common");
  const doc = usePriceChange(props.id);
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="NO">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title={tc("loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  const d = doc.data ?? null;
  return <Editor key={d ? `${d.id}-${d.status}` : "new"} doc={d} {...props} />;
}

function toDraftLines(d: PriceChangeDetail): DraftLine[] {
  return d.lines.map((l) => ({
    productId: l.productId,
    productCode: l.productCode,
    productName: l.productName,
    priceTypeId: l.priceTypeId,
    oldPrice: l.oldPrice ?? null,
    newPrice: l.newPrice,
    batchId: l.batchId ?? null,
    batchNumber: l.batchNumber ?? null,
    expiryDate: l.expiryDate ?? null,
  }));
}

function Editor({
  doc,
  branchId,
  preset,
  initialMode,
  canSet,
  onClose,
  onCreated,
}: {
  doc: PriceChangeDetail | null;
  branchId: number;
  preset?: DraftLine[];
  initialMode?: "PRODUCT" | "RECEIPT";
  canSet: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("prices.drawer");
  const tp = useTranslations("prices");
  const me = useMe();
  const types = usePriceTypes();
  const save = useSaveDraft();
  const submit = useSubmit();
  const cancel = useCancel();
  const reject = useReject();
  const editable = canSet && (!doc || doc.status === "DRAFT");
  const [date, setDate] = useState(formatIsoDate(doc?.effectiveFrom ?? todayTashkent()));
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<DraftLine[]>(doc ? toDraftLines(doc) : (preset ?? []));
  const [adding, setAdding] = useState<{
    product: string | null;
    productLabel?: { code: string; name: string };
    type: string | null;
    price: string;
  }>({
    product: null,
    type: null,
    price: "",
  });
  const [local, setLocal] = useState<string | null>(null);
  // «Kirim boʻyicha» rejimi (SPEC 6): narx faqat tanlangan oʻtkazilgan kirim partiyalariga.
  const [mode, setMode] = useState<"PRODUCT" | "RECEIPT">(doc?.receiptId ? "RECEIPT" : doc ? "PRODUCT" : (initialMode ?? "PRODUCT"));
  const [receipt, setReceipt] = useState<string | null>(doc?.receiptId ? String(doc.receiptId) : null);
  const [receiptLabel, setReceiptLabel] = useState<string | null>(doc?.receiptNumber ?? null);
  const [batchType, setBatchType] = useState<string | null>(null);
  const [loadingBatches, setLoadingBatches] = useState(false);
  const receiptOptions = useRef(new Map<string, string>());
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const [dialog, setDialog] = useState<"markup" | "approve" | "reject" | "cancel" | null>(null);
  const isDirector = can(me.data, PRICE_BELOW);
  const { priceWarnPct } = useThresholds();
  const typeName = (id: number) => types.data?.find((pt) => pt.id === id)?.name ?? "";
  const err = describeError(save.error ?? submit.error);
  const bigCount = lines.filter((l) => Math.abs(percentChange(l.oldPrice, parseMoneyInput(l.newPrice) ?? "") ?? 0) > priceWarnPct).length;

  function body() {
    const iso = parseUzDate(date);
    if (!iso) return (setLocal(t("errors.date")), null);
    if (lines.length === 0) return (setLocal(t("errors.noLines")), null);
    const out = [];
    for (const l of lines) {
      const p = parseMoneyInput(l.newPrice);
      if (!p || Number(p) <= 0) return (setLocal(t("errors.price", { name: l.productName })), null);
      out.push({ productId: l.productId, priceTypeId: l.priceTypeId, newPrice: p, batchId: l.batchId ?? undefined });
    }
    if (mode === "RECEIPT" && !receipt) return (setLocal(t("errors.receipt")), null);
    setLocal(null);
    return {
      branchId: doc?.branchId ?? branchId,
      effectiveFrom: iso,
      note: note.trim() || undefined,
      lines: out,
      receiptId: mode === "RECEIPT" && receipt ? Number(receipt) : undefined,
    };
  }

  async function saveDraft(then?: (id: number) => void) {
    const b = body();
    if (!b) return;
    save.mutate(
      { id: doc?.id, body: b },
      {
        onSuccess: (d) => {
          // Yangi hujjat: muharrir qayta ochilishi (onCreated) oʻtkazishdan keyin — aks holda natija xabari yoʻqoladi.
          if (then) return then(d.id);
          toast({ tone: "success", title: t("draftSaved"), description: d.number });
          if (!doc) onCreated(d.id);
        },
      },
    );
  }

  function addLine() {
    if (!adding.product || !adding.type || !adding.productLabel) return setLocal(t("errors.productType"));
    const productId = Number(adding.product);
    const priceTypeId = Number(adding.type);
    if (lines.some((l) => l.productId === productId && l.priceTypeId === priceTypeId && !l.batchId)) return setLocal(t("errors.duplicate"));
    setLines((ls) => [
      ...ls,
      {
        productId,
        priceTypeId,
        productCode: adding.productLabel!.code,
        productName: adding.productLabel!.name,
        oldPrice: null,
        newPrice: adding.price,
      },
    ]);
    setAdding({ product: null, type: adding.type, price: "" });
    setLocal(null);
  }

  async function addBatches() {
    if (!receipt || !batchType) return setLocal(t("errors.receiptType"));
    setLoadingBatches(true);
    try {
      const rb = await fetchReceiptBatches(Number(receipt));
      const have = new Set(lines.map(lineKey));
      const fresh = batchLines(rb, Number(batchType)).filter((l) => !have.has(lineKey(l)));
      if (fresh.length === 0) setLocal(t("errors.batchesAdded"));
      else {
        setLines((ls) => [...ls, ...fresh]);
        setLocal(null);
      }
    } catch (e) {
      setLocal(describeError(e).message ?? t("errors.batchesLoad"));
    } finally {
      setLoadingBatches(false);
    }
  }

  function switchMode(next: "PRODUCT" | "RECEIPT") {
    if (next === mode) return;
    if (lines.length > 0) return setLocal(t("errors.switchMode"));
    setMode(next);
    setLocal(null);
  }

  const batchMode = mode === "RECEIPT";

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={doc ? t("kindBy", { name: doc.createdBy }) : t("kind")}
      title={doc ? doc.number : t("newTitle")}
      status={doc ? <StatusBadge status={doc.status} /> : undefined}
      actions={
        <>
          {doc && canSet && (doc.status === "DRAFT" || doc.status === "PENDING_APPROVAL") ? (
            <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
              {t("cancelDoc")}
            </Button>
          ) : null}
          {doc ? (
            <Button
              variant="secondary"
              icon={Printer}
              onClick={() => window.open(`/api/price-changes/${doc.id}/pdf`, "_blank", "noopener")}
            >
              {t("print")}
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            {t("back")}
          </Button>
          {editable ? (
            <>
              <Button variant="secondary" loading={save.isPending && !submit.isPending} onClick={() => saveDraft()}>
                {t("saveDraft")}
              </Button>
              <Button
                icon={Check}
                loading={submit.isPending}
                onClick={() =>
                  saveDraft((id) =>
                    submit.mutate(id, {
                      onSuccess: (d) => {
                        toast({
                          tone: "success",
                          title: d.status === "APPROVED" ? t("applied") : t("sentToDirector"),
                          description: d.number,
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
                {t("post")}
              </Button>
            </>
          ) : null}
          {doc?.status === "PENDING_APPROVAL" && isDirector ? (
            <>
              <Button variant="secondary" onClick={() => (reject.reset(), setDialog("reject"))}>
                {t("reject")}
              </Button>
              <Button icon={Check} onClick={() => setDialog("approve")}>
                {t("approve")}
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc?.decisionReason ? (
          <Alert tone={doc.status === "REJECTED" ? "danger" : "info"} title={t("reason", { reason: doc.decisionReason })} />
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <TextField
            variant="date"
            label={t("effectiveFrom")}
            value={date}
            onChange={setDate}
            placeholder={tp("datePlaceholder")}
            disabled={!editable}
            required
          />
          <TextField label={t("note")} value={note} onChange={setNote} disabled={!editable} />
        </div>
        {editable ? (
          <div role="radiogroup" aria-label={t("modeGroup")} className="flex gap-6">
            <Radio
              name="pc-mode"
              value="PRODUCT"
              label={t("modeProduct")}
              description={t("modeProductHint")}
              checked={!batchMode}
              onChange={() => switchMode("PRODUCT")}
            />
            <Radio
              name="pc-mode"
              value="RECEIPT"
              label={t("modeReceipt")}
              description={t("modeReceiptHint")}
              checked={batchMode}
              onChange={() => switchMode("RECEIPT")}
            />
          </div>
        ) : batchMode ? (
          <Alert tone="info" title={t("byReceipt", { number: receiptLabel ?? "" })}>
            {t("byReceiptBody")}
          </Alert>
        ) : null}
        {editable && batchMode ? (
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-card border border-border p-3">
            <Select
              label={t("receipt")}
              value={receipt}
              loadOptions={async (q) => {
                const found = await searchPostedReceipts(doc?.branchId ?? branchId, q);
                found.forEach((o) => receiptOptions.current.set(o.value, o.label));
                return found;
              }}
              onChange={(v) => {
                if (lines.length > 0 && v !== receipt) return setLocal(t("errors.switchReceipt"));
                setReceipt(v);
                setReceiptLabel(v ? (receiptOptions.current.get(v) ?? null) : null);
              }}
              placeholder={t("receiptPlaceholder")}
              options={receipt && receiptLabel ? [{ value: receipt, label: receiptLabel }] : []}
            />
            <Select
              label={t("priceType")}
              value={batchType}
              onChange={setBatchType}
              options={(types.data ?? []).map((pt) => ({ value: String(pt.id), label: pt.name }))}
            />
            <Button variant="secondary" loading={loadingBatches} onClick={addBatches}>
              {t("addBatches")}
            </Button>
          </div>
        ) : null}
        {editable && !batchMode ? (
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-card border border-border p-3">
            <Select
              label={t("product")}
              value={adding.product}
              loadOptions={async (q) => {
                const found = await searchProducts(q);
                found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                return found;
              }}
              onChange={(v) => setAdding((a) => ({ ...a, product: v, productLabel: v ? seen.current.get(v) : undefined }))}
              placeholder={t("productPlaceholder")}
              options={[]}
              className="col-span-3"
            />
            <Select
              label={t("priceType")}
              value={adding.type}
              onChange={(v) => setAdding((a) => ({ ...a, type: v }))}
              options={(types.data ?? []).map((pt) => ({ value: String(pt.id), label: pt.name }))}
            />
            <TextField
              label={t("newPrice")}
              value={adding.price}
              onChange={(v) => setAdding((a) => ({ ...a, price: v }))}
              suffix={tp("sum")}
              inputMode="decimal"
            />
            <Button variant="secondary" onClick={addLine}>
              {t("addLine")}
            </Button>
          </div>
        ) : null}
        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {bigCount > 0 ? (
          <Alert tone="warning" title={t("bigChange", { count: bigCount })}>
            {t("bigChangeHint")}
          </Alert>
        ) : null}
        <div className="flex items-center justify-between">
          <h3 className="text-subtitle">{t("lines", { count: lines.length })}</h3>
          {editable && lines.length > 0 ? (
            <Button variant="tertiary" icon={Calculator} onClick={() => setDialog("markup")}>
              {t("markup")}
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">{t("col.product")}</th>
                {batchMode ? <th className="px-3 py-2 font-medium">{t("col.batch")}</th> : null}
                <th className="px-3 py-2 font-medium">{t("col.priceType")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("col.oldPrice")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("col.newPrice")}</th>
                <th className="px-3 py-2 text-right font-medium">{t("col.change")}</th>
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                    {batchMode ? t("emptyBatch") : t("emptyProduct")}
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const pct = percentChange(l.oldPrice, parseMoneyInput(l.newPrice) ?? "");
                  return (
                    <tr key={lineKey(l)} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                      </td>
                      {batchMode ? (
                        <td className="px-3 py-2">
                          <span className="font-mono">{l.batchNumber ?? "—"}</span>
                          {l.expiryDate ? (
                            <span className="block text-caption text-text-secondary">
                              {t("until", { date: formatDate(new Date(`${l.expiryDate}T00:00:00+05:00`)) })}
                            </span>
                          ) : null}
                        </td>
                      ) : null}
                      <td className="px-3 py-2">{typeName(l.priceTypeId)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.oldPrice ? formatMoney(l.oldPrice) : "—"}</td>
                      <td className="px-3 py-1 text-right">
                        {editable ? (
                          <TextField
                            label={t("newPrice")}
                            size="sm"
                            value={l.newPrice}
                            onChange={(v) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, newPrice: v } : x)))}
                            inputMode="decimal"
                            className="ml-auto w-36 [&>label]:sr-only [&_input]:text-right"
                          />
                        ) : (
                          <span className="tabular-nums">{formatMoney(l.newPrice)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {pct === null ? (
                          <span className="text-text-disabled">{t("new")}</span>
                        ) : Math.abs(pct) > priceWarnPct ? (
                          <Badge tone="warning" icon={TriangleAlert}>
                            {pct > 0 ? "+" : ""}
                            {pct.toLocaleString("uz-UZ")}%
                          </Badge>
                        ) : (
                          <span className="tabular-nums">
                            {pct > 0 ? "+" : ""}
                            {pct.toLocaleString("uz-UZ")}%
                          </span>
                        )}
                      </td>
                      {editable ? (
                        <td className="px-1">
                          <Button
                            variant="icon"
                            icon={Trash2}
                            aria-label={t("removeLine")}
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
      {dialog === "markup" ? (
        <MarkupDialog
          branchId={doc?.branchId ?? branchId}
          lines={lines}
          onClose={() => setDialog(null)}
          onApply={(prices) => (
            setLines((ls) =>
              ls.map((l) =>
                prices[`${l.productId}:${l.priceTypeId}`] ? { ...l, newPrice: prices[`${l.productId}:${l.priceTypeId}`] } : l,
              ),
            ),
            setDialog(null)
          )}
        />
      ) : null}
      {dialog === "approve" && doc ? <ApproveDialog id={doc.id} onClose={() => setDialog(null)} /> : null}
      {(dialog === "reject" || dialog === "cancel") && doc ? (
        <DeactivateDialog
          title={dialog === "reject" ? t("rejectTitle", { number: doc.number }) : t("cancelTitle", { number: doc.number })}
          consequence={t("consequence")}
          actionLabel={dialog === "reject" ? t("rejectAction") : t("cancelDoc")}
          pending={dialog === "reject" ? reject.isPending : cancel.isPending}
          error={dialog === "reject" ? reject.error : cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            (dialog === "reject" ? reject : cancel).mutate(
              { id: doc.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: dialog === "reject" ? t("rejected") : t("cancelled"), description: doc.number }),
                  setDialog(null)
                ),
              },
            )
          }
        />
      ) : null}
    </Drawer>
  );
}

function MarkupDialog({
  branchId,
  lines,
  onClose,
  onApply,
}: {
  branchId: number;
  lines: DraftLine[];
  onClose: () => void;
  onApply: (prices: Record<string, string>) => void;
}) {
  const t = useTranslations("prices.markup");
  const [base, setBase] = useState<string | null>("BASE_PRICE");
  const [percent, setPercent] = useState("15");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const pct = Number(percent.replace(",", "."));
    if (!Number.isFinite(pct) || pct < -90 || pct > 1000) return setError(t("percentError"));
    setPending(true);
    setError(null);
    try {
      const byType = new Map<number, number[]>();
      for (const l of lines) byType.set(l.priceTypeId, [...(byType.get(l.priceTypeId) ?? []), l.productId]);
      const result: Record<string, string> = {};
      let missing = 0;
      for (const [priceTypeId, productIds] of byType) {
        const out = await computeMarkup({
          branchId,
          productIds,
          priceTypeId,
          base: (base ?? "BASE_PRICE") as MarkupBase,
          percent: pct,
        });
        for (const m of out) {
          if (m.newPrice) result[`${m.productId}:${priceTypeId}`] = m.newPrice;
          else missing++;
        }
      }
      onApply(result);
      toast({
        tone: missing ? "warning" : "success",
        title: t("applied", { count: Object.keys(result).length }),
        description: missing ? t("missing", { count: missing }) : undefined,
      });
    } catch (e) {
      setError(describeError(e).message ?? t("failed"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm" title={t("title")} primaryAction={{ label: t("compute"), loading: pending, onClick: run }}>
      <div className="flex flex-col gap-4">
        <Select
          label={t("base")}
          value={base}
          onChange={setBase}
          options={[
            { value: "BASE_PRICE", label: t("BASE_PRICE") },
            { value: "CURRENT_SAME_TYPE", label: t("CURRENT_SAME_TYPE") },
            { value: "AVG_RECEIPT", label: t("AVG_RECEIPT"), sub: t("AVG_RECEIPT_HINT") },
            { value: "LAST_RECEIPT", label: t("LAST_RECEIPT") },
          ]}
        />
        <TextField label={t("percent")} value={percent} onChange={setPercent} suffix="%" inputMode="decimal" hint={t("percentHint")} />
        <p className="text-caption text-text-secondary">{t("exact")}</p>
        {error ? <Alert tone="danger" title={error} /> : null}
      </div>
    </Modal>
  );
}

export function ApproveDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const t = useTranslations("prices.approve");
  const approve = useApprove();
  const [pin, setPin] = useState("");
  const err = describeError(approve.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={t("title")}
      primaryAction={{
        label: t("submit"),
        loading: approve.isPending,
        onClick: () =>
          approve.mutate(
            { id, pin },
            {
              onSuccess: (d) => (toast({ tone: "success", title: t("done"), description: d.number }), onClose()),
            },
          ),
      }}
    >
      <p className="mb-4 text-text-secondary">{t("intro")}</p>
      <TextField
        label={t("pin")}
        variant="password"
        value={pin}
        onChange={setPin}
        inputMode="numeric"
        maxLength={6}
        error={err.fields.pin}
        autoFocus
        required
      />
      {err.message ? <Alert tone="danger" title={err.message} className="mt-4" /> : null}
    </Modal>
  );
}
