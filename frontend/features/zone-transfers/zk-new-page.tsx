"use client";

import { CalendarClock, Check, Layers, Send, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
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
import { InfoRow, SideCard, ZoneCell } from "@/features/warehouse-transfers/transfer-doc-page";
import { formatDate, formatQuantity } from "@/lib/format";
import { linesFrom, needsApproval, TRANSFER_QUAR, TRANSFER_ZK, useCreateZoneTransfer, useZoneStock, type ZoneStockRow } from "./api";
import { zkSteps } from "./doc-model";
import { useLineErrorText } from "./line-error";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/**
 * ZK — yangi zona koʻchirishi toʻliq sahifa (prototip `TransferDoc`, kind = zk, raqamsiz): Turi, Ombor, Qayerdan/Qayerga zona, izoh,
 * partiyalar FEFO tartibida; «Koʻchirish» (yoki karantindan sotuvga — «Tasdiqqa yuborish») tasdiqlash oynasi bilan → hujjat sahifasi.
 */
export function NewZoneTransferPage() {
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
  const create = useCreateZoneTransfer();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
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

  if (me.data && !can(me.data, TRANSFER_ZK)) return <ForbiddenState />;

  const steps = zkSteps("PENDING", approval).map((s, i) => ({
    label: td(`step.${s.key}`),
    state: i === 0 ? ("cur" as const) : ("next" as const),
  }));

  const check = () => {
    if (!from || !to) return setError(t("form.pickZones"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    setError(null);
    setConfirm(true);
  };

  const submit = () =>
    from && to
      ? create.mutate(
          { fromZoneId: from.id, toZoneId: to.id, note: note.trim(), lines: picked.lines },
          {
            onSuccess: (d) => {
              toast({ tone: "success", title: d.status === "PENDING" ? t("form.sent") : t("form.moved"), description: d.number });
              router.push(`/zone-transfers/${d.id}`);
            },
            onError: (e) => (setConfirm(false), setError(describeError(e).message ?? t("saveFailed"))),
          },
        )
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
        crumb={te("crumbNew")}
        title={t("form.title")}
        meta={<Steps steps={steps} />}
        actions={
          <Button icon={toApproval ? Send : Check} loading={create.isPending} onClick={check}>
            {toApproval ? t("form.sendForApproval") : t("form.move")}
          </Button>
        }
      />
      {approval ? (
        <Alert tone="warning" title={selfApprove ? t("form.selfApproveTitle") : t("form.needApprovalTitle")}>
          {selfApprove ? t("form.selfApproveBody") : t("form.needApprovalBody")}
        </Alert>
      ) : (
        <Alert tone="info" title={td("bDraftT")}>
          {tn("bNew")}
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
              <InfoRow k={td("hDate")} v={formatDate(new Date())} />
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
          <SideCard label={tz("sBy")} value={me.data?.fullName ?? "—"} note={from ? `${whPlace} · ${from.name}` : whPlace || undefined} />
          {approval ? (
            <SideCard label={tz("sAppr")} value={selfApprove ? (me.data?.fullName ?? "—") : tz("sApprWho")} muted={!selfApprove} />
          ) : null}
        </aside>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={toApproval ? tn("dSendT") : tn("dMoveT")}
        primaryAction={{ label: toApproval ? t("form.sendForApproval") : t("form.move"), loading: create.isPending, onClick: submit }}
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
