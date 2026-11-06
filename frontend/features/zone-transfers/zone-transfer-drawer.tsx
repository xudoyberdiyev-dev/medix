"use client";

import { Check, X } from "lucide-react";
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
import { ZoneTransferStatusBadge } from "./zone-transfers-page";

const KIND = "Zona koʻchirishi";
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export function ZoneTransferDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useZoneTransfer(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="ZK">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (!doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="Yuklanmoqda…">
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  return <View doc={doc.data} onClose={props.onClose} />;
}

function View({ doc, onClose }: { doc: ZoneTransferDetail; onClose: () => void }) {
  const me = useMe();
  const approve = useApproveZoneTransfer();
  const reject = useRejectZoneTransfer();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, TRANSFER_QUAR);
  const columns: TableColumn<ZoneTransferDetail["lines"][number]>[] = [
    { key: "productCode", title: "Kod", mono: true },
    { key: "productName", title: "Mahsulot", wrap: true },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (l) => day(l.expiryDate) },
    { key: "qty", title: "Soni", align: "right", render: (l) => formatQuantity(l.qty) },
  ];
  const fail = (e: unknown) =>
    toast({ tone: "danger", title: "Bajarilmadi", description: describeError(e).message ?? "Qayta urinib koʻring." });
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${KIND} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<ZoneTransferStatusBadge status={doc.status} />}
      actions={
        canDecide ? (
          <>
            <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
              Rad etish
            </Button>
            <Button
              icon={Check}
              loading={approve.isPending}
              onClick={() =>
                approve.mutate(doc.id, {
                  onSuccess: (d) => toast({ tone: "success", title: "Tasdiqlandi, tovar koʻchirildi", description: d.number }),
                  onError: fail,
                })
              }
            >
              Tasdiqlash va koʻchirish
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title="Tasdiq kutilmoqda">
            Karantindan sotuvga ochiq zonaga koʻchirish. Tasdiqlanmaguncha tovar «{doc.from.name}» zonasida qoladi.
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={`Rad etildi: ${doc.rejectReason ?? ""}`}>
            {doc.rejectedBy} — tovar joyida qoldi.
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">Ombor</dt>
            <dd>{doc.warehouse}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Qayerdan</dt>
            <dd>{doc.from.name}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Qayerga</dt>
            <dd>{doc.to.name}</dd>
          </div>
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">Izoh</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
        </dl>
        <Table caption="Koʻchirilgan partiyalar" density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">Jami: {formatQuantity(doc.totalQty)} dona</p>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Koʻchirishni rad etish"
        tone="danger"
        primaryAction={{
          label: "Rad etish",
          loading: reject.isPending,
          disabled: reason.trim() === "",
          onClick: () =>
            reject.mutate(
              { id: doc.id, reason: reason.trim() },
              { onSuccess: () => (setRejecting(false), toast({ tone: "success", title: "Rad etildi" })), onError: fail },
            ),
        }}
      >
        <TextField label="Sabab" value={reason} onChange={setReason} placeholder="Masalan: sifat sertifikati yoʻq" required />
      </Modal>
    </Drawer>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
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
    { key: "productName", title: "Mahsulot", wrap: true },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (r) => day(r.expiryDate) },
    { key: "qty", title: "Qoldiq", align: "right", render: (r) => formatQuantity(r.qty) },
    { key: "reserved", title: "Zahirada", align: "right", render: (r) => (r.reserved ? formatQuantity(r.reserved) : "—") },
    {
      key: "move",
      title: "Koʻchirish",
      align: "right",
      render: (r) => (
        <div className="ml-auto w-28">
          <TextField
            label={`${r.productName} ${r.batchNumber} — koʻchirish soni`}
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
    if (!from || !to) return setError("Qayerdan va qayerga zonalarini tanlang.");
    if (picked.error) return setError(picked.error);
    if (picked.lines.length === 0) return setError("Kamida bitta partiyaga koʻchirish sonini kiriting.");
    create.mutate(
      { fromZoneId: from.id, toZoneId: to.id, note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? "Tasdiqqa yuborildi" : "Tovar koʻchirildi",
            description: d.number,
          });
          onCreated(d.id);
        },
        onError: (e) => setError(describeError(e).message ?? "Saqlanmadi. Qayta urinib koʻring."),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={KIND}
      title="Yangi zona koʻchirishi"
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!from || !to}>
          {approval && !selfApprove ? "Tasdiqqa yuborish" : "Koʻchirish"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Koʻchirilmadi">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Ombor"
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label="Qayerdan"
            value={fromId}
            onChange={(v) => (setFromId(v), setQty({}), v === toId ? setToId(null) : undefined)}
            options={zones.map(zoneOption)}
            disabled={!warehouse}
            required
          />
          <Select
            label="Qayerga"
            value={toId}
            onChange={setToId}
            options={zones.filter((z) => String(z.id) !== fromId).map(zoneOption)}
            disabled={!warehouse}
            required
          />
        </div>
        {approval ? (
          <Alert tone="warning" title={selfApprove ? "Karantindan sotuvga — siz tasdiqlaysiz" : "Karantindan sotuvga — tasdiq kerak"}>
            {selfApprove
              ? "Koʻchirish darhol oʻtkaziladi va hujjatda tasdiqlovchi sifatida siz koʻrsatilasiz."
              : "Hujjat Filial rahbari yoki Direktor tasdigʻiga yuboriladi. Tasdiqlanmaguncha tovar karantinda qoladi."}
          </Alert>
        ) : null}
        {from ? (
          stock.error ? (
            <ErrorState onRetry={() => stock.refetch()} />
          ) : (
            <Table
              caption={`«${from.name}» zonasidagi partiyalar`}
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.batchId)}
              loading={stock.isPending}
              emptyState={<EmptyState icon={X} title="Zonada tovar yoʻq" description="Boshqa zonani tanlang." />}
            />
          )
        ) : null}
        <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: sifat tekshiruvidan oʻtdi" />
      </div>
    </Drawer>
  );
}
