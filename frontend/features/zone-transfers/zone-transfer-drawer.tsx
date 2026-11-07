"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useWarehouses, ZONE_LABELS } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import {
  linesFrom,
  needsApproval,
  TRANSFER_QUAR,
  useApproveZoneTransfer,
  useCreateZoneTransfer,
  useRejectZoneTransfer,
  useZoneStock,
  useZoneTransfer,
  type ZoneStockRow,
  type ZoneTransferDetail,
} from "./api";
import { useLineErrorText } from "./line-error";
import { ZoneTransferStatusBadge } from "./zone-transfers-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export function ZoneTransferDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("zoneTransfers");
  const tc = useTranslations("common");
  const doc = useZoneTransfer(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="ZK">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (!doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title={tc("loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  return <View doc={doc.data} onClose={props.onClose} />;
}

function View({ doc, onClose }: { doc: ZoneTransferDetail; onClose: () => void }) {
  const t = useTranslations("zoneTransfers");
  const me = useMe();
  const approve = useApproveZoneTransfer();
  const reject = useRejectZoneTransfer();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, TRANSFER_QUAR);
  const columns: TableColumn<ZoneTransferDetail["lines"][number]>[] = [
    { key: "productCode", title: t("col.code"), mono: true },
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "qty", title: t("col.count"), align: "right", render: (l) => formatQuantity(l.qty) },
  ];
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${t("kind")} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<ZoneTransferStatusBadge status={doc.status} />}
      actions={
        canDecide ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
              {t("view.reject")}
            </Button>
            <Button
              icon={Check}
              loading={approve.isPending}
              onClick={() =>
                approve.mutate(doc.id, {
                  onSuccess: (d) => toast({ tone: "success", title: t("view.approved"), description: d.number }),
                  onError: fail,
                })
              }
            >
              {t("view.approve")}
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title={t("view.pendingTitle")}>
            {t("view.pendingBody", { zone: doc.from.name })}
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={t("view.rejectedTitle", { reason: doc.rejectReason ?? "" })}>
            {t("view.rejectedBody", { who: doc.rejectedBy ?? "" })}
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">{t("view.warehouse")}</dt>
            <dd>{doc.warehouse}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.from")}</dt>
            <dd>{doc.from.name}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.to")}</dt>
            <dd>{doc.to.name}</dd>
          </div>
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
        </dl>
        <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">{t("view.total", { qty: formatQuantity(doc.totalQty) })}</p>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title={t("view.rejectTitle")}
        tone="danger"
        primaryAction={{
          label: t("view.reject"),
          loading: reject.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            reject.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setRejecting(false), toast({ tone: "success", title: t("view.rejected") })), onError: fail },
            ),
        }}
      >
        <TextField label={t("view.rejectReason")} value={reason} onChange={setReason} placeholder={t("view.rejectPlaceholder")} required />
      </Modal>
    </Drawer>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("zoneTransfers");
  const lineError = useLineErrorText();
  const me = useMe();
  const warehouses = useWarehouses();
  const create = useCreateZoneTransfer();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const stock = useZoneStock(fromId ? Number(fromId) : null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const zones = warehouse?.zones ?? [];
  const from = zones.find((z) => String(z.id) === fromId);
  const to = zones.find((z) => String(z.id) === toId);
  const approval = needsApproval(from?.type, to?.type);
  const selfApprove = approval && can(me.data, TRANSFER_QUAR);
  const zoneOption = (z: (typeof zones)[number]) => ({
    value: String(z.id),
    label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
  });
  const rows = stock.data ?? [];
  const picked = linesFrom(rows, qty);

  const columns: TableColumn<ZoneStockRow>[] = [
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (r) => day(r.expiryDate) },
    { key: "qty", title: t("col.stock"), align: "right", render: (r) => formatQuantity(r.qty) },
    { key: "reserved", title: t("col.reserved"), align: "right", render: (r) => (r.reserved ? formatQuantity(r.reserved) : "—") },
    {
      key: "move",
      title: t("col.move"),
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
  ];

  const submit = () => {
    if (!from || !to) return setError(t("form.pickZones"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    create.mutate(
      { fromZoneId: from.id, toZoneId: to.id, note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? t("form.sent") : t("form.moved"),
            description: d.number,
          });
          onCreated(d.id);
        },
        onError: (e) => setError(describeError(e).message ?? t("saveFailed")),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("kind")}
      title={t("form.title")}
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!from || !to}>
          {approval && !selfApprove ? t("form.sendForApproval") : t("form.move")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("form.errorTitle")}>
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-4">
          <Select
            label={t("form.warehouse")}
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
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
            required
          />
        </div>
        {approval ? (
          <Alert tone="warning" title={selfApprove ? t("form.selfApproveTitle") : t("form.needApprovalTitle")}>
            {selfApprove ? t("form.selfApproveBody") : t("form.needApprovalBody")}
          </Alert>
        ) : null}
        {from ? (
          stock.error ? (
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
          )
        ) : null}
        <TextField label={t("form.note")} value={note} onChange={setNote} placeholder={t("form.notePlaceholder")} />
      </div>
    </Drawer>
  );
}
