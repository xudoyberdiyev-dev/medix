"use client";

import { Calculator, Check, Trash2, TriangleAlert, X } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseMoneyInput, parseUzDate, todayTashkent, usePriceTypes } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { describeError } from "@/features/setup/form-error";
import { formatMoney } from "@/lib/format";
import {
  computeMarkup,
  percentChange,
  searchProducts,
  useApprove,
  useCancel,
  usePriceChange,
  useReject,
  useSaveDraft,
  useSubmit,
  type DraftLine,
  type PriceChangeDetail,
} from "./api";
import { StatusBadge } from "./prices-page";

export function PriceChangeDrawer(props: {
  id: number | null;
  branchId: number;
  preset?: DraftLine[];
  canSet: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const doc = usePriceChange(props.id);
  if (props.id !== null && doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind="Narx oʻzgarishi" title="NO">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (props.id !== null && !doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind="Narx oʻzgarishi" title="Yuklanmoqda…">
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
  }));
}

function Editor({
  doc,
  branchId,
  preset,
  canSet,
  onClose,
  onCreated,
}: {
  doc: PriceChangeDetail | null;
  branchId: number;
  preset?: DraftLine[];
  canSet: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
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
  const seen = useRef(new Map<string, { code: string; name: string }>());
  const [dialog, setDialog] = useState<"markup" | "approve" | "reject" | "cancel" | null>(null);
  const isDirector = me.data?.role.code === "DIRECTOR";
  const typeName = (id: number) => types.data?.find((t) => t.id === id)?.name ?? "";
  const err = describeError(save.error ?? submit.error);
  const bigCount = lines.filter((l) => Math.abs(percentChange(l.oldPrice, parseMoneyInput(l.newPrice) ?? "") ?? 0) > 20).length;

  function body() {
    const iso = parseUzDate(date);
    if (!iso) return (setLocal("Kuchga kirish sanasi KK.OO.YYYY koʻrinishida boʻlsin."), null);
    if (lines.length === 0) return (setLocal("Hujjatda qator yoʻq. Kamida bitta mahsulot narxini kiriting."), null);
    const out = [];
    for (const l of lines) {
      const p = parseMoneyInput(l.newPrice);
      if (!p || Number(p) <= 0) return (setLocal(`«${l.productName}» uchun narx notoʻgʻri. Musbat summa kiriting.`), null);
      out.push({ productId: l.productId, priceTypeId: l.priceTypeId, newPrice: p });
    }
    setLocal(null);
    return { branchId: doc?.branchId ?? branchId, effectiveFrom: iso, note: note.trim() || undefined, lines: out };
  }

  async function saveDraft(then?: (id: number) => void) {
    const b = body();
    if (!b) return;
    save.mutate(
      { id: doc?.id, body: b },
      {
        onSuccess: (d) => {
          if (!doc) onCreated(d.id);
          if (then) then(d.id);
          else toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
        },
      },
    );
  }

  function addLine() {
    if (!adding.product || !adding.type || !adding.productLabel) return setLocal("Mahsulot va narx turini tanlang.");
    const productId = Number(adding.product);
    const priceTypeId = Number(adding.type);
    if (lines.some((l) => l.productId === productId && l.priceTypeId === priceTypeId))
      return setLocal("Bu mahsulot va narx turi allaqachon qoʻshilgan.");
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

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={doc ? `Narx oʻzgarishi · ${doc.createdBy}` : "Narx oʻzgarishi"}
      title={doc ? doc.number : "Yangi NO"}
      status={doc ? <StatusBadge status={doc.status} /> : undefined}
      actions={
        <>
          {doc && canSet && (doc.status === "DRAFT" || doc.status === "PENDING_APPROVAL") ? (
            <Button variant="tertiary" icon={X} className="mr-auto" onClick={() => (cancel.reset(), setDialog("cancel"))}>
              Hujjatni bekor qilish
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Ortga
          </Button>
          {editable ? (
            <>
              <Button variant="secondary" loading={save.isPending && !submit.isPending} onClick={() => saveDraft()}>
                Qoralamani saqlash
              </Button>
              <Button
                icon={Check}
                loading={submit.isPending}
                onClick={() =>
                  saveDraft((id) =>
                    submit.mutate(id, {
                      onSuccess: (d) =>
                        toast({
                          tone: "success",
                          title: d.status === "APPROVED" ? "Narxlar kuchga kirdi" : "Direktor tasdigʻiga yuborildi",
                          description: d.number,
                        }),
                    }),
                  )
                }
              >
                Oʻtkazish
              </Button>
            </>
          ) : null}
          {doc?.status === "PENDING_APPROVAL" && isDirector ? (
            <>
              <Button variant="secondary" onClick={() => (reject.reset(), setDialog("reject"))}>
                Rad etish
              </Button>
              <Button icon={Check} onClick={() => setDialog("approve")}>
                Tasdiqlash
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc?.decisionReason ? <Alert tone={doc.status === "REJECTED" ? "danger" : "info"} title={`Sabab: ${doc.decisionReason}`} /> : null}
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Kuchga kirish sanasi" value={date} onChange={setDate} placeholder="KK.OO.YYYY" disabled={!editable} required />
          <TextField label="Izoh" value={note} onChange={setNote} disabled={!editable} />
        </div>
        {editable ? (
          <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-3 rounded-card border border-border p-3">
            <Select
              label="Mahsulot"
              value={adding.product}
              loadOptions={async (q) => {
                const found = await searchProducts(q);
                found.forEach((o) => seen.current.set(o.value, { code: o.sub, name: o.label }));
                return found;
              }}
              onChange={(v) => setAdding((a) => ({ ...a, product: v, productLabel: v ? seen.current.get(v) : undefined }))}
              placeholder="Nom yoki kod boʻyicha qidiring"
              options={[]}
              className="col-span-3"
            />
            <Select
              label="Narx turi"
              value={adding.type}
              onChange={(v) => setAdding((a) => ({ ...a, type: v }))}
              options={(types.data ?? []).map((t) => ({ value: String(t.id), label: t.name }))}
            />
            <TextField
              label="Yangi narx"
              value={adding.price}
              onChange={(v) => setAdding((a) => ({ ...a, price: v }))}
              suffix="soʻm"
              inputMode="decimal"
            />
            <Button variant="secondary" onClick={addLine}>
              Qator qoʻshish
            </Button>
          </div>
        ) : null}
        {local ? <Alert tone="danger" title={local} /> : null}
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {bigCount > 0 ? (
          <Alert tone="warning" title={`${bigCount} ta qatorda narx 20% dan koʻp oʻzgaradi`}>
            Tekshirib chiqing — xato kiritilgan boʻlishi mumkin.
          </Alert>
        ) : null}
        <div className="flex items-center justify-between">
          <h3 className="text-subtitle">Qatorlar · {lines.length}</h3>
          {editable && lines.length > 0 ? (
            <Button variant="tertiary" icon={Calculator} onClick={() => setDialog("markup")}>
              Ommaviy ustama
            </Button>
          ) : null}
        </div>
        <div className="overflow-hidden rounded-card border border-border">
          <table className="w-full text-table">
            <thead className="bg-table-header text-left text-text-secondary">
              <tr>
                <th className="px-3 py-2 font-medium">Mahsulot</th>
                <th className="px-3 py-2 font-medium">Narx turi</th>
                <th className="px-3 py-2 text-right font-medium">Eski narx</th>
                <th className="px-3 py-2 text-right font-medium">Yangi narx</th>
                <th className="px-3 py-2 text-right font-medium">Oʻzgarish</th>
                {editable ? <th className="w-10" /> : null}
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-text-secondary">
                    Qator yoʻq. Yuqorida mahsulot tanlab qoʻshing yoki «Amaldagi narxlar» jadvalidan belgilang.
                  </td>
                </tr>
              ) : (
                lines.map((l, i) => {
                  const pct = percentChange(l.oldPrice, parseMoneyInput(l.newPrice) ?? "");
                  return (
                    <tr key={`${l.productId}-${l.priceTypeId}`} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                      </td>
                      <td className="px-3 py-2">{typeName(l.priceTypeId)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{l.oldPrice ? formatMoney(l.oldPrice) : "—"}</td>
                      <td className="px-3 py-1 text-right">
                        {editable ? (
                          <TextField
                            label="Yangi narx"
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
                          <span className="text-text-disabled">yangi</span>
                        ) : Math.abs(pct) > 20 ? (
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
                            aria-label="Qatorni olib tashlash"
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
          title={dialog === "reject" ? `${doc.number}ni rad etasizmi?` : `${doc.number}ni bekor qilasizmi?`}
          consequence="Narxlar oʻzgarmaydi. Hujjat tarixda qoladi va qayta oʻzgartirilmaydi."
          actionLabel={dialog === "reject" ? "Hujjatni rad etish" : "Hujjatni bekor qilish"}
          pending={dialog === "reject" ? reject.isPending : cancel.isPending}
          error={dialog === "reject" ? reject.error : cancel.error}
          onClose={() => setDialog(null)}
          onConfirm={(reason) =>
            (dialog === "reject" ? reject : cancel).mutate(
              { id: doc.id, reason },
              {
                onSuccess: () => (
                  toast({ tone: "success", title: dialog === "reject" ? "Rad etildi" : "Bekor qilindi", description: doc.number }),
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
  const [base, setBase] = useState<string | null>("BASE_PRICE");
  const [percent, setPercent] = useState("15");
  const [rounding, setRounding] = useState<string | null>("100");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    const pct = Number(percent.replace(",", "."));
    if (!Number.isFinite(pct) || pct < -90 || pct > 1000) return setError("Foiz −90 … 1000 oraligʻida boʻlsin.");
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
          base: base === "CURRENT_SAME_TYPE" ? "CURRENT_SAME_TYPE" : "BASE_PRICE",
          percent: pct,
          rounding: Number(rounding ?? 0),
        });
        for (const m of out) {
          if (m.newPrice) result[`${m.productId}:${priceTypeId}`] = m.newPrice;
          else missing++;
        }
      }
      onApply(result);
      toast({
        tone: missing ? "warning" : "success",
        title: `${Object.keys(result).length} ta qatorga narx qoʻyildi`,
        description: missing ? `${missing} ta mahsulotda asos narx yoʻq — ular oʻzgarmadi.` : undefined,
      });
    } catch (e) {
      setError(describeError(e).message ?? "Hisoblab boʻlmadi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Ommaviy ustama"
      primaryAction={{ label: "Narxlarni hisoblash", loading: pending, onClick: run }}
    >
      <div className="flex flex-col gap-4">
        <Select
          label="Asos"
          value={base}
          onChange={setBase}
          options={[
            { value: "BASE_PRICE", label: "Bazaviy narx (Narx)" },
            { value: "CURRENT_SAME_TYPE", label: "Shu turdagi amaldagi narx" },
          ]}
          hint="Oʻrtacha va oxirgi kirim narxi — kirimlar bosqichidan keyin"
        />
        <TextField label="Ustama" value={percent} onChange={setPercent} suffix="%" inputMode="decimal" hint="Manfiy — chegirma" />
        <Select
          label="Yaxlitlash"
          value={rounding}
          onChange={setRounding}
          options={[
            { value: "0", label: "Yaxlitlanmaydi" },
            { value: "100", label: "100 soʻmgacha" },
            { value: "500", label: "500 soʻmgacha" },
            { value: "1000", label: "1 000 soʻmgacha" },
          ]}
        />
        {error ? <Alert tone="danger" title={error} /> : null}
      </div>
    </Modal>
  );
}

function ApproveDialog({ id, onClose }: { id: number; onClose: () => void }) {
  const approve = useApprove();
  const [pin, setPin] = useState("");
  const err = describeError(approve.error);
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title="Narx oʻzgarishini tasdiqlash"
      primaryAction={{
        label: "PIN bilan tasdiqlash",
        loading: approve.isPending,
        onClick: () =>
          approve.mutate(
            { id, pin },
            {
              onSuccess: (d) => (toast({ tone: "success", title: "Tasdiqlandi — narxlar kuchga kirdi", description: d.number }), onClose()),
            },
          ),
      }}
    >
      <p className="mb-4 text-text-secondary">Tannarxdan past narxlar bor. Tasdiqlasangiz, narxlar kuchga kiradi.</p>
      <TextField
        label="PIN"
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
