"use client";

import { Check, PackageCheck, Printer, Truck, X } from "lucide-react";
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
import { receiveLinesFrom, TRANSFER_CANCEL, TRANSFER_RECEIVE, TRANSFER_SEND } from "@/features/warehouse-transfers/api";
import { WarehouseTransferStatusBadge } from "@/features/warehouse-transfers/warehouse-transfers-page";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  useBranchSale,
  useBuyerWarehouses,
  useCancelBranchSale,
  useCreateBranchSale,
  useReceiveBranchSale,
  useSellerZoneStock,
  useSendBranchSale,
  type BranchSaleDetail,
  type BranchSaleLine,
} from "./api";
import { BranchSaleShortagePanel } from "./shortage-panel";

const KIND = "Filiallararo savdo";
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const fail = (e: unknown) =>
  toast({ tone: "danger", title: "Bajarilmadi", description: describeError(e).message ?? "Qayta urinib koʻring." });

export function BranchSaleDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useBranchSale(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="FS">
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

function View({ doc, onClose }: { doc: BranchSaleDetail; onClose: () => void }) {
  const me = useMe();
  const send = useSendBranchSale();
  const cancel = useCancelBranchSale();
  // Server ham tekshiradi: joʻnatish / bekor qilish — sotuvchi filial, qabul — xaridor filial
  const side = (branch: number) => Boolean(me.data?.allBranches) || me.data?.branchId === branch;
  const [receiving, setReceiving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const canSend = doc.status === "DRAFT" && can(me.data, TRANSFER_SEND) && side(doc.seller.id);
  const canCancel = doc.status === "DRAFT" && can(me.data, TRANSFER_CANCEL) && side(doc.seller.id);
  const canReceive = doc.status === "IN_TRANSIT" && can(me.data, TRANSFER_RECEIVE) && side(doc.buyer.id);
  const received = doc.status === "RECEIVED";
  const columns: TableColumn<BranchSaleLine>[] = [
    { key: "productCode", title: "Kod", mono: true },
    { key: "productName", title: "Mahsulot", wrap: true },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (l) => day(l.expiryDate) },
    { key: "qty", title: "Joʻnatildi", align: "right", render: (l) => formatQuantity(l.qty) },
    ...(received
      ? [
          {
            key: "receivedQty",
            title: "Qabul qilindi",
            align: "right" as const,
            render: (l: BranchSaleLine) => {
              const got = l.receivedQty ?? 0;
              return got < l.qty ? <span className="text-danger">{formatQuantity(got)}</span> : formatQuantity(got);
            },
          },
        ]
      : []),
    ...(doc.total
      ? [
          {
            key: "unitCost",
            title: "Tannarx",
            align: "right" as const,
            render: (l: BranchSaleLine) => (l.unitCost ? formatMoney(l.unitCost) : "—"),
          },
          {
            key: "amount",
            title: "Summa",
            align: "right" as const,
            render: (l: BranchSaleLine) => (l.amount ? formatMoney(l.amount) : "—"),
          },
        ]
      : []),
  ];
  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={`${KIND} · ${doc.createdBy}`}
      title={doc.number}
      subtitle={formatDateTime(new Date(doc.createdAt))}
      status={<WarehouseTransferStatusBadge status={doc.status} />}
      actions={
        <>
          <Button variant="tertiary" icon={Printer} onClick={() => window.open(`/api/branch-sales/${doc.id}/pdf`, "_blank", "noopener")}>
            Chop etish
          </Button>
          {canSend || canCancel || canReceive ? (
            <>
              {canCancel ? (
                <Button variant="secondary" icon={X} onClick={() => setCancelling(true)}>
                  Bekor qilish
                </Button>
              ) : null}
              {canSend ? (
                <Button
                  icon={Truck}
                  loading={send.isPending}
                  onClick={() =>
                    send.mutate(doc.id, {
                      onSuccess: (d) =>
                        toast({
                          tone: "success",
                          title: "Joʻnatildi — tovar yoʻlda",
                          description: `${d.number} · ${d.invoiceNumber ?? ""}`,
                        }),
                      onError: fail,
                    })
                  }
                >
                  Joʻnatish
                </Button>
              ) : null}
              {canReceive ? (
                <Button icon={PackageCheck} onClick={() => setReceiving(true)}>
                  Qabul qilish
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "DRAFT" ? (
          <Alert tone="info" title="Qoralama">
            Tovar hali «{doc.fromZone.name}» zonasida. Joʻnatilganda qoldiqdan chiqadi, partiya tannarxida hisob-faktura (HF) yoziladi va «
            {doc.buyer.name}» filiali qarzi oshadi.
          </Alert>
        ) : null}
        {doc.status === "IN_TRANSIT" ? (
          <Alert tone="info" title="Yoʻlda">
            {doc.sentBy} joʻnatdi ({doc.sentAt ? formatDateTime(new Date(doc.sentAt)) : ""}). «{doc.buyer.name}» filiali qabul qilishini
            kutmoqda.
          </Alert>
        ) : null}
        <BranchSaleShortagePanel doc={doc} />
        <dl className="grid grid-cols-2 gap-4 text-body md:grid-cols-4">
          <div>
            <dt className="text-caption text-text-secondary">Sotuvchi</dt>
            <dd>
              {doc.seller.name} · {doc.fromWarehouse.name} · {doc.fromZone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Xaridor</dt>
            <dd>
              {doc.buyer.name} · {doc.toWarehouse.name}
              {doc.toZone ? ` · ${doc.toZone.name}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Joʻnatdi</dt>
            <dd>{doc.sentBy ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Qabul qildi</dt>
            <dd>{doc.receivedBy ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Hisob-faktura</dt>
            <dd className="font-mono">{doc.invoiceNumber ?? "—"}</dd>
          </div>
          {doc.total ? (
            <>
              <div>
                <dt className="text-caption text-text-secondary">Summa (QQS bilan)</dt>
                <dd>{formatMoney(doc.total)}</dd>
              </div>
              <div>
                <dt className="text-caption text-text-secondary">shu jumladan QQS</dt>
                <dd>{doc.vatTotal ? formatMoney(doc.vatTotal) : "—"}</dd>
              </div>
            </>
          ) : null}
          {doc.note ? (
            <div className="col-span-2 md:col-span-4">
              <dt className="text-caption text-text-secondary">Izoh</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
        </dl>
        <Table caption="Partiyalar" density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">Jami: {formatQuantity(doc.totalQty)} dona</p>
      </div>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Qoralamani bekor qilish"
        tone="danger"
        primaryAction={{
          label: "Bekor qilish",
          loading: cancel.isPending,
          onClick: () =>
            cancel.mutate(doc.id, {
              onSuccess: () => (setCancelling(false), toast({ tone: "success", title: "Bekor qilindi" })),
              onError: fail,
            }),
        }}
      >
        <p className="text-body">Hujjat bekor qilinadi, tovar joyida qoladi. Bu amalni qaytarib boʻlmaydi.</p>
      </Modal>
      {receiving ? <ReceiveModal doc={doc} onClose={() => setReceiving(false)} /> : null}
    </Drawer>
  );
}

function ReceiveModal({ doc, onClose }: { doc: BranchSaleDetail; onClose: () => void }) {
  const warehouses = useWarehouses();
  const receive = useReceiveBranchSale();
  const zones = warehouses.data?.find((w) => w.id === doc.toWarehouse.id)?.zones ?? [];
  const defaultZone = zones.find((z) => z.type === "RECEIVING");
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [got, setGot] = useState<Record<number, string>>({});
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const zone = zoneId ?? (defaultZone ? String(defaultZone.id) : null);
  const picked = receiveLinesFrom(doc.lines, got);

  const submit = () => {
    if (!zone) return setError("Qabul zonasini tanlang.");
    if (picked.error) return setError(picked.error);
    if (picked.shortage > 0 && note.trim() === "") return setError("Kamomad bor — izoh yozing: nima boʻldi, kim bilan tekshirildi.");
    receive.mutate(
      { id: doc.id, body: { toZoneId: Number(zone), note: note.trim(), lines: picked.lines } },
      {
        onSuccess: (d) => {
          onClose();
          toast({
            tone: d.shortageQty > 0 ? "warning" : "success",
            title: d.shortageQty > 0 ? `Qabul qilindi, kamomad ${formatQuantity(d.shortageQty)} dona` : "Toʻliq qabul qilindi",
            description: d.number,
          });
        },
        onError: (e) => setError(describeError(e).message ?? "Saqlanmadi. Qayta urinib koʻring."),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`Qabul qilish: ${doc.number}`}
      primaryAction={{ label: "Qabul qilish", loading: receive.isPending, onClick: submit }}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Qabul qilinmadi">
            {error}
          </Alert>
        ) : null}
        <Select
          label="Qaysi zonaga"
          value={zone}
          onChange={setZoneId}
          options={zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${ZONE_LABELS[z.type]}` }))}
          required
        />
        <p className="text-caption text-text-secondary">Sanab chiqing. Boʻsh qoldirilgan qator — toʻliq keldi.</p>
        <ul className="flex flex-col gap-2">
          {doc.lines.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-4">
              <span className="text-body">
                {l.productName} · <span className="font-mono">{l.batchNumber}</span> — joʻnatildi {formatQuantity(l.qty)}
              </span>
              <div className="w-28 shrink-0">
                <TextField
                  label={`${l.productName} ${l.batchNumber} — kelgan soni`}
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
          <Alert tone="warning" title={`Kamomad: ${formatQuantity(picked.shortage)} dona`}>
            Izoh majburiy. Kamomad hujjatda qayd etiladi va hal qilish uchun xabar yuboriladi.
          </Alert>
        ) : null}
        <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: 2 quti shikastlangan, haydovchi bilan tekshirildi" />
      </div>
    </Modal>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const warehouses = useWarehouses();
  const create = useCreateBranchSale();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [fromId, setFromId] = useState<string | null>(null);
  const [toId, setToId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const stock = useSellerZoneStock(fromId ? Number(fromId) : null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);
  const buyers = useBuyerWarehouses(warehouse ? warehouse.branchId : null);
  const targets = buyers.data ?? [];
  const zones = warehouse?.zones ?? [];
  const from = zones.find((z) => String(z.id) === fromId);
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
      title: "Joʻnatish",
      align: "right",
      render: (r) => (
        <div className="ml-auto w-28">
          <TextField
            label={`${r.productName} ${r.batchNumber} — joʻnatish soni`}
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
    if (!from || !toId) return setError("Sotuvchi zonani va xaridor omborini tanlang.");
    if (picked.error) return setError(picked.error);
    if (picked.lines.length === 0) return setError("Kamida bitta partiyaga joʻnatish sonini kiriting.");
    create.mutate(
      { fromZoneId: from.id, toWarehouseId: Number(toId), note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
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
      title="Yangi filiallararo savdo"
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!from || !toId}>
          Qoralamani saqlash
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Saqlanmadi">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label="Qaysi ombordan"
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setFromId(null), setToId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label="Zona"
            value={fromId}
            onChange={(v) => (setFromId(v), setQty({}))}
            options={zones.map((z) => ({ value: String(z.id), label: `${z.name} · ${ZONE_LABELS[z.type]}` }))}
            disabled={!warehouse}
            required
          />
          <Select
            label="Xaridor ombori"
            value={toId}
            onChange={setToId}
            options={targets.map((w) => ({ value: String(w.id), label: `${w.branch.name} · ${w.name}` }))}
            disabled={!warehouse}
            required
          />
        </div>
        {warehouse && buyers.data && targets.length === 0 ? (
          <Alert tone="info" title="Boshqa filialda faol ombor yoʻq">
            Filiallararo savdo uchun xaridor filialda faol ombor kerak. Filial ichida — ombor koʻchirishi (OK).
          </Alert>
        ) : null}
        <p className="text-caption text-text-secondary">
          Narx — partiya tannarxi (QQS shu summa ichida). Guruh ichidagi qarz mijozlar qarzi jamiga kirmaydi.
        </p>
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
        <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: Samarqand filialiga kamyob dorilar" />
      </div>
    </Drawer>
  );
}
