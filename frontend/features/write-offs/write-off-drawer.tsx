"use client";

import { CalendarX, Check, Printer, X } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  fillExpired,
  HC_APPROVE,
  HC_DIRECTOR,
  HC_DIRECTOR_LIMIT,
  HC_REASON_LABELS,
  linesFrom,
  useApproveWriteOff,
  useCreateWriteOff,
  useRejectWriteOff,
  useWriteOff,
  useWriteOffStock,
  type WriteOffDetail,
  type WriteOffReason,
  type WriteOffStockRow,
} from "./api";
import { WriteOffStatusBadge } from "./write-offs-page";

const KIND = "Hisobdan chiqarish";
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export function WriteOffDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useWriteOff(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="HC">
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

function View({ doc, onClose }: { doc: WriteOffDetail; onClose: () => void }) {
  const me = useMe();
  const approve = useApproveWriteOff();
  const reject = useRejectWriteOff();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const level = can(me.data, HC_APPROVE) && (!doc.needsDirector || can(me.data, HC_DIRECTOR));
  const canDecide = doc.status === "PENDING" && level;
  const withCost = doc.totalCost != null;
  const columns: TableColumn<WriteOffDetail["lines"][number]>[] = [
    { key: "productCode", title: "Kod", mono: true },
    { key: "productName", title: "Mahsulot", wrap: true },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (l) => day(l.expiryDate) },
    { key: "qty", title: "Soni", align: "right", render: (l) => formatQuantity(l.qty) },
    ...(withCost
      ? [
          {
            key: "cost",
            title: "Tannarx",
            align: "right" as const,
            render: (l: WriteOffDetail["lines"][number]) => (l.cost != null ? formatMoney(l.cost) : "—"),
          },
          {
            key: "amount",
            title: "Summa",
            align: "right" as const,
            render: (l: WriteOffDetail["lines"][number]) => (l.amount != null ? formatMoney(l.amount) : "—"),
          },
        ]
      : []),
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
      status={<WriteOffStatusBadge status={doc.status} />}
      actions={
        <>
          <Button variant="tertiary" icon={Printer} onClick={() => window.open(`/api/write-offs/${doc.id}/pdf`, "_blank", "noopener")}>
            Dalolatnomani chop etish
          </Button>
          {canDecide ? (
            <>
              <Button variant="secondary" icon={X} onClick={() => setRejecting(true)}>
                Rad etish
              </Button>
              <Button
                icon={Check}
                loading={approve.isPending}
                onClick={() =>
                  approve.mutate(doc.id, {
                    onSuccess: (d) => toast({ tone: "success", title: "Tasdiqlandi, tovar hisobdan chiqarildi", description: d.number }),
                    onError: fail,
                  })
                }
              >
                Tasdiqlash va chiqarish
              </Button>
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title={doc.needsDirector ? "Direktor tasdigʻi kutilmoqda" : "Tasdiq kutilmoqda"}>
            {doc.needsDirector
              ? `Tannarx summasi ${formatMoney(HC_DIRECTOR_LIMIT)} dan katta — Direktor tasdiqlaydi. `
              : "Filial rahbari yoki Direktor tasdiqlaydi. "}
            Tasdiqlanmaguncha tovar «{doc.zone.name}» zonasida qoladi.
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={`Rad etildi: ${doc.rejectReason ?? ""}`}>
            {doc.rejectedBy} — tovar joyida qoldi.
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">Ombor · zona</dt>
            <dd>
              {doc.warehouse} · {doc.zone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Sabab</dt>
            <dd>{HC_REASON_LABELS[doc.reason]}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Dalolatnoma</dt>
            <dd>{doc.actNo ?? "—"}</dd>
          </div>
          {doc.sourceTransfer ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">Manba</dt>
              <dd>Ombor koʻchirishi {doc.sourceTransfer} kamomadi — tovar joʻnatishda chiqqan, qoldiq oʻzgarmaydi</dd>
            </div>
          ) : null}
          {doc.commission ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">Komissiya</dt>
              <dd>{doc.commission}</dd>
            </div>
          ) : null}
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">Izoh</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
          {doc.postedBy ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">Tasdiqladi</dt>
              <dd>
                {doc.postedBy}
                {doc.postedAt ? ` · ${formatDateTime(new Date(doc.postedAt))}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <Table
          caption="Hisobdan chiqarilgan partiyalar"
          density="compact"
          columns={columns}
          rows={doc.lines}
          rowKey={(l) => String(l.id)}
        />
        <p className="text-right text-caption text-text-secondary">
          Jami: {formatQuantity(doc.totalQty)} dona
          {doc.totalCost != null ? ` · ${formatMoney(doc.totalCost)} soʻm (tannarxda)` : ""}
        </p>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Hisobdan chiqarishni rad etish"
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
        <TextField label="Sabab" value={reason} onChange={setReason} placeholder="Masalan: dalolatnoma imzolanmagan" required />
      </Modal>
    </Drawer>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const me = useMe();
  const warehouses = useWarehouses();
  const create = useCreateWriteOff();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [reason, setReason] = useState<WriteOffReason | null>(null);
  const [actNo, setActNo] = useState("");
  const [commission, setCommission] = useState("");
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const stock = useWriteOffStock(zoneId ? Number(zoneId) : null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const zones = warehouse?.zones ?? [];
  const zone = zones.find((z) => String(z.id) === zoneId);
  const canApprove = can(me.data, HC_APPROVE);
  const rows = stock.data ?? [];
  const picked = linesFrom(rows, qty);
  const expiredCount = rows.filter((r) => r.expired && r.free > 0).length;

  const columns: TableColumn<WriteOffStockRow>[] = [
    { key: "productName", title: "Mahsulot", wrap: true },
    { key: "batchNumber", title: "Partiya", mono: true },
    {
      key: "expiryDate",
      title: "Yaroqlilik",
      render: (r) =>
        r.expired ? (
          <Badge tone="danger" icon={CalendarX}>
            {day(r.expiryDate)} · oʻtgan
          </Badge>
        ) : (
          day(r.expiryDate)
        ),
    },
    { key: "qty", title: "Qoldiq", align: "right", render: (r) => formatQuantity(r.qty) },
    { key: "reserved", title: "Zahirada", align: "right", render: (r) => (r.reserved ? formatQuantity(r.reserved) : "—") },
    {
      key: "writeOff",
      title: "Chiqarish",
      align: "right",
      render: (r) => (
        <div className="ml-auto w-28">
          <TextField
            label={`${r.productName} ${r.batchNumber} — hisobdan chiqarish soni`}
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
    if (!zone) return setError("Ombor va zonani tanlang.");
    if (!reason) return setError("Sababni tanlang.");
    if (reason === "OTHER" && note.trim() === "") return setError("Sabab «Boshqa» — izoh yozing (nima boʻldi).");
    if (picked.error) return setError(picked.error);
    if (picked.lines.length === 0) return setError("Kamida bitta partiyaga hisobdan chiqarish sonini kiriting.");
    create.mutate(
      { zoneId: zone.id, reason, actNo: actNo.trim(), commission: commission.trim(), note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? "Tasdiqqa yuborildi" : "Tovar hisobdan chiqarildi",
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
      title="Yangi hisobdan chiqarish"
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!zone || !reason}>
          {canApprove ? "Hisobdan chiqarish" : "Tasdiqqa yuborish"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Hisobdan chiqarilmadi">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-3 gap-4">
          <Select
            label="Ombor"
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setZoneId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label="Zona"
            value={zoneId}
            onChange={(v) => (setZoneId(v), setQty({}))}
            options={zones.map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
            }))}
            disabled={!warehouse}
            required
          />
          <Select
            label="Sabab"
            value={reason}
            onChange={(v) => setReason(v as WriteOffReason | null)}
            options={Object.entries(HC_REASON_LABELS).map(([value, label]) => ({ value, label }))}
            required
          />
        </div>
        <Alert tone="info" title={canApprove ? "Siz tasdiqlaysiz" : "Tasdiq kerak"}>
          {canApprove
            ? `Hujjat darhol oʻtkaziladi. Tannarx summasi ${formatMoney(HC_DIRECTOR_LIMIT)} dan katta boʻlsa — Direktor tasdigʻiga yuboriladi.`
            : `Hujjat Filial rahbari tasdigʻiga yuboriladi (${formatMoney(HC_DIRECTOR_LIMIT)} dan katta — Direktor). Tasdiqlanmaguncha tovar zonada qoladi.`}
        </Alert>
        {zone ? (
          stock.error ? (
            <ErrorState onRetry={() => stock.refetch()} />
          ) : (
            <>
              {reason === "EXPIRED" && expiredCount > 0 ? (
                <div>
                  <Button variant="secondary" size="sm" icon={CalendarX} onClick={() => setQty(fillExpired(rows))}>
                    Muddati oʻtganlarni toʻldirish ({expiredCount})
                  </Button>
                </div>
              ) : null}
              <Table
                caption={`«${zone.name}» zonasidagi partiyalar`}
                density="compact"
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.batchId)}
                loading={stock.isPending}
                emptyState={<EmptyState icon={X} title="Zonada tovar yoʻq" description="Boshqa zonani tanlang." />}
              />
            </>
          )
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <TextField label="Dalolatnoma raqami" value={actNo} onChange={setActNo} placeholder="Masalan: 12/2026" />
          <TextField label="Komissiya" value={commission} onChange={setCommission} placeholder="F.I.Sh., vergul bilan" />
        </div>
        <TextField
          label="Izoh"
          value={note}
          onChange={setNote}
          placeholder="Masalan: tashishda qadoq yirtilgan"
          required={reason === "OTHER"}
        />
      </div>
    </Drawer>
  );
}
