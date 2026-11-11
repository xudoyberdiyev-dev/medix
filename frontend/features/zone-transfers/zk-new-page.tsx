"use client";

import { CalendarClock, Check, Layers, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList, useWarehouses, ZONE_LABELS, zoneLabel } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { KIND_PAGE } from "@/features/transfers/model";
import { fefo } from "@/features/warehouse-transfers/doc-model";
import { AutosaveNote } from "@/features/warehouse-transfers/ok-draft-form";
import { InfoRow, SideCard, ZoneCell } from "@/features/warehouse-transfers/transfer-doc-page";
import { formatDate, formatQuantity } from "@/lib/format";
import {
  linesFrom,
  needsApproval,
  TRANSFER_QUAR,
  TRANSFER_ZK,
  useCancelZoneTransfer,
  useCreateZoneTransferDraft,
  useSubmitZoneTransfer,
  useUpdateZoneTransferDraft,
  useZoneStock,
  type ZoneStockRow,
  type ZoneTransferDetail,
} from "./api";
import { zkDraftKey, zkSteps, type ZkDraft } from "./doc-model";
import { useLineErrorText } from "./line-error";
import { ZoneTransferStatusBadge } from "./zone-transfers-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

const now = () => new Date().toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit" });

/**
 * ZK — yangi zona koʻchirishi / qoralamasi toʻliq sahifa (prototip `TransferDoc`, kind = zk, editable): Turi, Ombor, Qayerdan/Qayerga
 * zona, izoh, partiyalar FEFO tartibida. Oʻzgarish 0,8 s dan keyin avtomatik saqlanadi (yangi — qoralama yaratiladi, raqam oladi va
 * hujjat sahifasiga oʻtiladi; tovar joyida qoladi). «Koʻchirish» (karantindan sotuvga — «Tasdiqqa yuborish») tasdiqlash oynasi bilan;
 * qoralamani bekor qilish — «Yana» menyusida.
 */
export function NewZoneTransferPage({ doc = null }: { doc?: ZoneTransferDetail | null }) {
  const t = useTranslations("zoneTransfers");
  const td = useTranslations("warehouseTransfers.doc");
  const te = useTranslations("warehouseTransfers.edit");
  const tz = useTranslations("zoneTransfers.doc");
  const tn = useTranslations("zoneTransfers.newDoc");
  const tk = useTranslations("transfers.kind");
  const lineError = useLineErrorText();
  const router = useRouter();
  const me = useMe();
  const warehouses = useWarehouses();
  const branches = useBranchList();
  const createDraft = useCreateZoneTransferDraft();
  const updateDraft = useUpdateZoneTransferDraft();
  const submitDraft = useSubmitZoneTransfer();
  const cancelDraft = useCancelZoneTransfer();
  const busy = createDraft.isPending || updateDraft.isPending;
  const [warehouseId, setWarehouseId] = useState<string | null>(doc ? String(doc.warehouseId) : null);
  const [fromId, setFromId] = useState<string | null>(doc ? String(doc.from.id) : null);
  const [toId, setToId] = useState<string | null>(doc ? String(doc.to.id) : null);
  const [note, setNote] = useState(doc?.note ?? "");
  const [qty, setQty] = useState<Record<number, string>>(() =>
    Object.fromEntries((doc?.lines ?? []).map((l) => [l.batchId, String(l.qty)])),
  );
  const [error, setError] = useState<string | null>(null);
  const [dlg, setDlg] = useState<"submit" | "cancel" | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(() =>
    doc
      ? zkDraftKey({
          fromZoneId: doc.from.id,
          toZoneId: doc.to.id,
          note: doc.note ?? "",
          lines: doc.lines.map((l) => ({ batchId: l.batchId, qty: l.qty })),
        })
      : null,
  );
  const [save, setSave] = useState<"idle" | "saving" | "saved" | "error">(doc ? "saved" : "idle");
  const [savedAt, setSavedAt] = useState(doc ? now() : "");
  const stock = useZoneStock(fromId ? Number(fromId) : null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const zones = warehouse?.zones ?? [];
  const from = zones.find((z) => String(z.id) === fromId);
  const to = zones.find((z) => String(z.id) === toId);
  const approval = needsApproval(from?.type, to?.type);
  const selfApprove = approval && can(me.data, TRANSFER_QUAR);
  const toApproval = approval && !selfApprove;
  const rows = useMemo(() => fefo(stock.data ?? []), [stock.data]);
  const picked = linesFrom(rows, qty);
  const total = picked.lines.reduce((s, l) => s + l.qty, 0);
  const branch = branches.data?.find((b) => b.id === warehouse?.branchId)?.name ?? "";
  const whPlace = warehouse ? [branch, warehouse.name].filter(Boolean).join(" · ") : "";
  const zoneName = (z: (typeof zones)[number]) => (z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${zoneLabel(z.type)}`);
  const zoneOption = (z: (typeof zones)[number]) => ({ value: String(z.id), label: zoneName(z) });

  const draft: ZkDraft | null =
    from && to && stock.data && !picked.error && picked.lines.length
      ? { fromZoneId: from.id, toZoneId: to.id, note: note.trim(), lines: picked.lines }
      : null;
  const key = zkDraftKey(draft);
  const dirty = key !== null && key !== savedKey;

  useEffect(() => {
    if (!dirty || busy) return;
    const d = draft;
    const k = key;
    const h = setTimeout(() => {
      if (!d || !k) return;
      setSave("saving");
      const ok = () => (setSavedKey(k), setSave("saved"), setSavedAt(now()), setError(null));
      const fail = (e: unknown) => (setSave("error"), setError(describeError(e).message ?? t("saveFailed")));
      if (doc) updateDraft.mutate({ id: doc.id, body: d }, { onSuccess: ok, onError: fail });
      else createDraft.mutate(d, { onSuccess: (r) => (ok(), router.replace(`/zone-transfers/${r.id}`)), onError: fail });
    }, 800);
    return () => clearTimeout(h);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- faqat kalit oʻzgarganda
  }, [key, dirty, busy]);

  if (me.data && !can(me.data, TRANSFER_ZK)) return <ForbiddenState />;

  const steps = zkSteps("DRAFT", approval).map((s) => ({ label: td(`step.${s.key}`), state: s.state }));
  const saving = dirty || busy || save === "saving";

  const check = () => {
    if (!from || !to) return setError(t("form.pickZones"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    setError(null);
    setDlg("submit");
  };

  // mutateAsync: muvaffaqiyatdan keyin hujjat holati oʻzgaradi va bu sahifa koʻrinish sahifasiga almashadi (unmount) —
  // `mutate(..., { onSuccess })` chaqiruv qaytmasligi mumkin, vaʼda esa har doim bajariladi.
  const fail = (e: unknown) => (setDlg(null), setError(describeError(e).message ?? t("saveFailed")));

  const submit = () =>
    doc
      ? submitDraft
          .mutateAsync(doc.id)
          .then((d) => toast({ tone: "success", title: d.status === "PENDING" ? t("form.sent") : t("form.moved"), description: d.number }))
          .catch(fail)
      : undefined;

  const cancel = () =>
    doc
      ? cancelDraft
          .mutateAsync(doc.id)
          .then(() => toast({ tone: "success", title: td("tCancelled", { n: doc.number }) }))
          .catch(fail)
      : undefined;

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
      title: te("cAvail"),
      align: "right",
      render: (r) => (
        <span className="flex flex-col items-end tabular-nums">
          {formatQuantity(r.free)}
          {r.reserved ? (
            <span className="text-caption text-text-secondary">{te("reserved", { q: formatQuantity(r.reserved) })}</span>
          ) : null}
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
            label={t("form.qtyLabel", { product: r.productName, batch: r.batchNumber })}
            className="[&>label]:sr-only"
            value={qty[r.batchId] ?? ""}
            onChange={(v) => (setQty((q) => ({ ...q, [r.batchId]: v })), setError(null))}
            placeholder={r.free > 0 ? `≤ ${r.free}` : "0"}
            disabled={r.free === 0}
            inputMode="numeric"
          />
        </div>
      ),
    },
    { key: "toZone", title: td("cToZone"), render: () => (to ? <ZoneCell name={to.name} /> : "—") },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-12">
      <DocumentHeader
        parent={{ label: td("parent"), href: "/transfers" }}
        crumb={doc ? doc.number : te("crumbNew")}
        crumbMono={!!doc}
        title={doc ? tz("title") : t("form.title")}
        number={doc?.number}
        status={doc ? <ZoneTransferStatusBadge status={doc.status} /> : undefined}
        meta={
          <>
            <Steps steps={steps} />
            <AutosaveNote state={{ save, savedAt, dirty: dirty || busy }} />
          </>
        }
        actions={
          <>
            {doc ? (
              <RowMenu
                label={td("more")}
                items={[
                  {
                    key: "cancel",
                    label: td("cancel"),
                    icon: <X size={16} strokeWidth={1.5} aria-hidden />,
                    onSelect: () => setDlg("cancel"),
                  },
                ]}
              />
            ) : null}
            <Button icon={toApproval ? Send : Check} loading={submitDraft.isPending} disabled={!doc || saving} onClick={check}>
              {toApproval ? t("form.sendForApproval") : t("form.move")}
            </Button>
          </>
        }
      />
      {approval ? (
        <Alert tone="warning" title={selfApprove ? t("form.selfApproveTitle") : t("form.needApprovalTitle")}>
          {selfApprove ? t("form.selfApproveBody") : t("form.needApprovalBody")}
        </Alert>
      ) : (
        <Alert tone="info" title={td("bDraftT")}>
          {tn("bDraft")}
        </Alert>
      )}
      {error ? (
        <Alert tone="danger" title={t("form.errorTitle")}>
          {error}
        </Alert>
      ) : null}
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex min-w-0 flex-col gap-4">
          <section className="rounded-card border border-border bg-surface">
            <h2 className="border-b border-border px-5 py-4 text-subtitle">{td("info")}</h2>
            <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-3">
              <Select
                label={td("hKind")}
                value="ZK"
                onChange={(v) =>
                  v === "OK" ? router.push("/warehouse-transfers/new") : v === "FS" ? router.push(`${KIND_PAGE.FS}?new=1`) : undefined
                }
                options={(["ZK", "OK", "FS"] as const).map((k) => ({ value: k, label: tk(k) }))}
                disabled={!!doc}
                hint={doc ? te("kindLocked") : undefined}
                required
              />
              <Select
                label={t("form.warehouse")}
                value={warehouseId}
                onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
                options={active.map((w) => ({ value: String(w.id), label: w.name }))}
                required
              />
              <div className="hidden md:block" aria-hidden />
              <Select
                label={t("form.from")}
                value={fromId}
                onChange={(v) => (setFromId(v), setQty({}), v === toId ? setToId(null) : undefined)}
                options={zones.map(zoneOption)}
                disabled={!warehouse}
                required
              />
              <Select
                label={t("form.to")}
                value={toId}
                onChange={setToId}
                options={zones.filter((z) => String(z.id) !== fromId).map(zoneOption)}
                disabled={!warehouse}
                hint={tn("sameWh")}
                required
              />
              <TextField label={t("form.note")} value={note} onChange={setNote} placeholder={t("form.notePlaceholder")} />
            </div>
            <dl className="flex flex-col border-t border-border px-5 py-2">
              <InfoRow k={td("hDate")} v={formatDate(doc ? new Date(doc.createdAt) : new Date())} />
            </dl>
          </section>
          <section className="rounded-card border border-border bg-surface">
            <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
              <h2 className="flex items-center gap-2 text-subtitle">
                {td("lines")}
                <span className="font-normal text-text-secondary">{picked.lines.length}</span>
              </h2>
              <span className="inline-flex items-center gap-1 text-caption text-text-secondary">
                <CalendarClock size={14} strokeWidth={1.5} aria-hidden />
                {te("fefoHint")}
              </span>
            </div>
            {!from ? (
              <EmptyState icon={X} title={te("pickFromTitle")} description={tn("pickFromHint")} />
            ) : stock.error ? (
              <ErrorState onRetry={() => stock.refetch()} />
            ) : (
              <Table
                caption={t("form.stockCaption", { zone: from.name })}
                density="compact"
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.batchId)}
                loading={stock.isPending}
                emptyState={<EmptyState icon={X} title={t("form.emptyZoneTitle")} description={t("form.emptyZoneHint")} />}
              />
            )}
          </section>
        </div>
        <aside className="flex min-w-0 flex-col gap-3">
          <SideCard label={td("sLines")} value={formatQuantity(picked.lines.length)} />
          <SideCard label={td("sQty")} value={formatQuantity(total)} />
          <SideCard
            label={tz("sBy")}
            value={doc?.createdBy ?? me.data?.fullName ?? "—"}
            note={from ? `${whPlace} · ${from.name}` : whPlace || undefined}
          />
          {approval ? (
            <SideCard label={tz("sAppr")} value={selfApprove ? (me.data?.fullName ?? "—") : tz("sApprWho")} muted={!selfApprove} />
          ) : null}
        </aside>
      </div>
      <Modal
        open={dlg === "cancel"}
        onClose={() => setDlg(null)}
        title={td("dCancT", { n: doc?.number ?? "" })}
        tone="danger"
        primaryAction={{ label: td("cancel"), loading: cancelDraft.isPending, onClick: cancel }}
      >
        <p className="text-body">{tn("dCanc")}</p>
      </Modal>
      <Modal
        open={dlg === "submit"}
        onClose={() => setDlg(null)}
        title={toApproval ? tn("dSendT") : tn("dMoveT")}
        primaryAction={{ label: toApproval ? t("form.sendForApproval") : t("form.move"), loading: submitDraft.isPending, onClick: submit }}
      >
        <ul className="flex flex-col gap-2 text-body">
          <li className="flex items-start gap-2">
            <Layers size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
            {tz("cfZk", {
              w: whPlace,
              a: from ? zoneName(from) : "",
              b: to ? zoneName(to) : "",
              n: picked.lines.length,
              q: formatQuantity(total),
            })}
          </li>
        </ul>
      </Modal>
    </div>
  );
}
