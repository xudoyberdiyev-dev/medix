"use client";

import { Check, PackageCheck, Truck, X } from "lucide-react";
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
import { linesFrom, type ZoneStockRow } from "@/features/zone-transfers/api";
import { useLineErrorText } from "@/features/zone-transfers/line-error";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import {
  receiveLinesFrom,
  TRANSFER_CANCEL,
  TRANSFER_RECEIVE,
  TRANSFER_SEND,
  useCancelWarehouseTransfer,
  useCreateWarehouseTransfer,
  useReceiveWarehouseTransfer,
  useSendWarehouseTransfer,
  useSourceZoneStock,
  useWarehouseTransfer,
  type TransferLine,
  type WarehouseTransferDetail,
} from "./api";
import { useReceiveErrorText } from "./receive-error";
import { ShortagePanel } from "./shortage-panel";
import { WarehouseTransferStatusBadge } from "./warehouse-transfers-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export function WarehouseTransferDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("warehouseTransfers");
  const tc = useTranslations("common");
  const doc = useWarehouseTransfer(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="OK">
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

function View({ doc, onClose }: { doc: WarehouseTransferDetail; onClose: () => void }) {
  const t = useTranslations("warehouseTransfers");
  const fail = (e: unknown) => toast({ tone: "danger", title: t("failed"), description: describeError(e).message ?? t("retryHint") });
  const me = useMe();
  const send = useSendWarehouseTransfer();
  const cancel = useCancelWarehouseTransfer();
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canSend = doc.status === "DRAFT" && can(me.data, TRANSFER_SEND);
  const canCancel = doc.status === "DRAFT" && can(me.data, TRANSFER_CANCEL);
  const canReceive = doc.status === "IN_TRANSIT" && can(me.data, TRANSFER_RECEIVE);
  const received = doc.status === "RECEIVED";
  const columns: TableColumn<TransferLine>[] = [
    { key: "productCode", title: t("col.code"), mono: true },
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "qty", title: t("col.sent"), align: "right", render: (l) => formatQuantity(l.qty) },
    ...(received
      ? [
          {
            key: "receivedQty",
            title: t("col.received"),
            align: "right" as const,
            render: (l: TransferLine) => {
              const got = l.receivedQty ?? 0;
              return got < l.qty ? <span className="text-danger">{formatQuantity(got)}</span> : formatQuantity(got);
            },
          },
        ]
      : []),
  ];
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${t("kind")} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<WarehouseTransferStatusBadge status={doc.status} />}
      actions={
        canSend || canCancel || canReceive ? (
          <>
            {canCancel ? (
              <Button variant="secondary" icon={X} onClick={() => setCancelling(true)}>
                {t("view.cancel")}
              </Button>
            ) : null}
            {canSend ? (
              <Button
                icon={Truck}
                loading={send.isPending}
                onClick={() =>
                  send.mutate(doc.id, {
                    onSuccess: (d) => toast({ tone: "success", title: t("view.sentToast"), description: d.number }),
                    onError: fail,
                  })
                }
              >
                {t("view.send")}
              </Button>
            ) : null}
            {canReceive ? (
              <Button icon={PackageCheck} onClick={() => setReceiving(true)}>
                {t("view.receive")}
              </Button>
            ) : null}
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "DRAFT" ? (
          <Alert tone="info" title={t("view.draftTitle")}>
            {t("view.draftBody", { zone: doc.fromZone.name })}
          </Alert>
        ) : null}
        {doc.status === "IN_TRANSIT" ? (
          <Alert tone="info" title={t("view.transitTitle")}>
            {t("view.transitBody", {
              who: doc.sentBy ?? "",
              at: doc.sentAt ? formatDateTime(new Date(doc.sentAt)) : "",
              target: doc.toWarehouse.name,
            })}
          </Alert>
        ) : null}
        <ShortagePanel doc={doc} />
        <dl className="grid grid-cols-2 gap-4 text-body md:grid-cols-4">
          <div>
            <dt className="text-caption text-text-secondary">{t("view.from")}</dt>
            <dd>
              {doc.fromWarehouse.name} · {doc.fromZone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.to")}</dt>
            <dd>
              {doc.toWarehouse.name}
              {doc.toZone ? ` · ${doc.toZone.name}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.sentBy")}</dt>
            <dd>{doc.sentBy ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.receivedBy")}</dt>
            <dd>{doc.receivedBy ?? "—"}</dd>
          </div>
          {doc.note ? (
            <div className="col-span-2 md:col-span-4">
              <dt className="text-caption text-text-secondary">{t("view.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
        </dl>
        <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">{t("view.total", { qty: formatQuantity(doc.totalQty) })}</p>
      </div>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t("view.cancelTitle")}
        tone="danger"
        primaryAction={{
          label: t("view.cancel"),
          loading: cancel.isPending,
          onClick: () =>
            cancel.mutate(doc.id, {
              onSuccess: () => (setCancelling(false), toast({ tone: "success", title: t("view.cancelled") })),
              onError: fail,
            }),
        }}
      >
        <p className="text-body">{t("view.cancelBody")}</p>
      </Modal>
      {receiving ? <ReceiveModal doc={doc} onClose={() => setReceiving(false)} /> : null}
    </Drawer>
  );
}

function ReceiveModal({ doc, onClose }: { doc: WarehouseTransferDetail; onClose: () => void }) {
  const t = useTranslations("warehouseTransfers");
  const receiveError = useReceiveErrorText();
  const warehouses = useWarehouses();
  const receive = useReceiveWarehouseTransfer();
  const zones = warehouses.data?.find((w) => w.id === doc.toWarehouse.id)?.zones ?? [];
  const defaultZone = zones.find((z) => z.type === "RECEIVING");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [got, setGot] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const zone = zoneId ?? (defaultZone ? String(defaultZone.id) : null);
  const picked = receiveLinesFrom(doc.lines, got);

  const submit = () => {
    if (!zone) return setError(t("receive.pickZone"));
    if (picked.error) return setError(receiveError(picked.error));
    if (picked.shortage > 0 && note.trim() === "") return setError(t("receive.noteRequired"));
    receive.mutate(
      { id: doc.id, body: { toZoneId: Number(zone), note: note.trim(), lines: picked.lines } },
      {
        onSuccess: (d) => {
          onClose();
          toast({
            tone: d.shortageQty > 0 ? "warning" : "success",
            title: d.shortageQty > 0 ? t("receive.doneShortage", { qty: formatQuantity(d.shortageQty) }) : t("receive.doneFull"),
            description: d.number,
          });
        },
        onError: (e) => setError(describeError(e).message ?? t("saveFailed")),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("receive.title", { number: doc.number })}
      primaryAction={{ label: t("receive.action"), loading: receive.isPending, onClick: submit }}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("receive.errorTitle")}>
            {error}
          </Alert>
        ) : null}
        <Select
          label={t("receive.zone")}
          value={zone}
          onChange={setZoneId}
          options={zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${ZONE_LABELS[z.type]}` }))}
          required
        />
        <p className="text-caption text-text-secondary">{t("receive.hint")}</p>
        <ul className="flex flex-col gap-2">
          {doc.lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4">
              <span className="text-body">
                {l.productName} · <span className="font-mono">{l.batchNumber}</span> —{" "}
                {t("receive.sentQty", { qty: formatQuantity(l.qty) })}
              </span>
              <div className="w-28 shrink-0">
                <TextField
                  label={t("receive.gotLabel", { product: l.productName, batch: l.batchNumber })}
                  className="[&>label]:sr-only"
                  value={got[l.id] ?? ""}
                  onChange={(v) => (setGot((g) => ({ ...g, [l.id]: v })), setError(null))}
                  placeholder={String(l.qty)}
                  inputMode="numeric"
                />
              </div>
            </li>
          ))}
        </ul>
        {picked.shortage > 0 ? (
          <Alert tone="warning" title={t("receive.shortageTitle", { qty: formatQuantity(picked.shortage) })}>
            {t("receive.shortageBody")}
          </Alert>
        ) : null}
        <TextField label={t("receive.note")} value={note} onChange={setNote} placeholder={t("receive.notePlaceholder")} />
      </div>
    </Modal>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("warehouseTransfers");
  const lineError = useLineErrorText();
  const warehouses = useWarehouses();
  const create = useCreateWarehouseTransfer();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const stock = useSourceZoneStock(fromId ? Number(fromId) : null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const targets = active.filter((w) => warehouse && w.id !== warehouse.id && w.branchId === warehouse.branchId);
  const zones = warehouse?.zones ?? [];
  const from = zones.find((z) => String(z.id) === fromId);
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
      title: t("col.send"),
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
    if (!from || !toId) return setError(t("form.pickZones"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    create.mutate(
      { fromZoneId: from.id, toWarehouseId: Number(toId), note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({ tone: "success", title: t("form.saved"), description: d.number });
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
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!from || !toId}>
          {t("form.save")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("form.errorTitle")}>
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label={t("form.fromWarehouse")}
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label={t("form.zone")}
            value={fromId}
            onChange={(v) => (setFromId(v), setQty({}))}
            options={zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${ZONE_LABELS[z.type]}` }))}
            disabled={!warehouse}
            required
          />
          <Select
            label={t("form.toWarehouse")}
            value={toId}
            onChange={setToId}
            options={targets.map((w) => ({ value: String(w.id), label: w.name }))}
            disabled={!warehouse}
            required
          />
        </div>
        {warehouse && targets.length === 0 ? (
          <Alert tone="info" title={t("form.noTargetsTitle")}>
            {t("form.noTargetsBody", { fs: "FS" })}
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
