"use client";

import { Check, Gift, X } from "lucide-react";
import { useRef, useState } from "react";
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
import { ZONE_LABELS } from "@/features/organization/api";
import { searchSuppliers, useReceipts } from "@/features/receipts/api";
import { describeError } from "@/features/setup/form-error";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  QY_APPROVE,
  QY_REASON_LABELS,
  returnLinesFrom,
  useApproveSupplierReturn,
  useCreateSupplierReturn,
  useRejectSupplierReturn,
  useReturnStock,
  useSupplierReturn,
  zonesOf,
  type ReturnStockRow,
  type SupplierReturnDetail,
  type SupplierReturnReason,
} from "./api";
import { SupplierReturnStatusBadge } from "./supplier-returns-page";

const KIND = "YB ga qaytarish";
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const zoneLabel = (z: { name: string; type: string }) => {
  const t = ZONE_LABELS[z.type as keyof typeof ZONE_LABELS];
  return !t || z.name === t ? z.name : `${z.name} · ${t}`;
};

function BonusBadge() {
  return (
    <Badge tone="info" icon={Gift}>
      Bonus
    </Badge>
  );
}

export function SupplierReturnDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useSupplierReturn(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="QY">
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

function View({ doc, onClose }: { doc: SupplierReturnDetail; onClose: () => void }) {
  const me = useMe();
  const approve = useApproveSupplierReturn();
  const reject = useRejectSupplierReturn();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const canDecide = doc.status === "PENDING" && can(me.data, QY_APPROVE);
  const withAmount = doc.totalAmount != null;
  type Line = SupplierReturnDetail["lines"][number];
  const columns: TableColumn<Line>[] = [
    { key: "productCode", title: "Kod", mono: true },
    {
      key: "productName",
      title: "Mahsulot",
      wrap: true,
      render: (l) => (
        <span className="flex items-center gap-2">
          {l.productName}
          {l.bonus ? <BonusBadge /> : null}
        </span>
      ),
    },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (l) => day(l.expiryDate) },
    { key: "qty", title: "Soni", align: "right", render: (l) => formatQuantity(l.qty) },
    ...(withAmount
      ? [
          {
            key: "price",
            title: "Kirim narxi",
            align: "right" as const,
            render: (l: Line) => (l.price != null ? formatMoney(l.price) : "—"),
          },
          {
            key: "amount",
            title: "Summa",
            align: "right" as const,
            render: (l: Line) => (l.amount != null ? formatMoney(l.amount) : "—"),
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
      status={<SupplierReturnStatusBadge status={doc.status} />}
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
                  onSuccess: (d) => toast({ tone: "success", title: "Tasdiqlandi, tovar YB ga qaytarildi", description: d.number }),
                  onError: fail,
                })
              }
            >
              Tasdiqlash va qaytarish
            </Button>
          </>
        ) : undefined
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title="Tasdiq kutilmoqda">
            Filial rahbari yoki Ombor mudiri tasdiqlaydi. Tasdiqlanmaguncha tovar «{doc.zone.name}» zonasida qoladi, YB qarzi oʻzgarmaydi.
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={`Rad etildi: ${doc.rejectReason ?? ""}`}>
            {doc.rejectedBy} — tovar joyida qoldi.
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div className="col-span-2">
            <dt className="text-caption text-text-secondary">Yetkazib beruvchi</dt>
            <dd>{doc.supplier}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Kirim</dt>
            <dd>
              <span className="font-mono">{doc.receiptNumber}</span> · {day(doc.receiptDate)}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Ombor · zona</dt>
            <dd>
              {doc.warehouse} · {doc.zone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Sabab</dt>
            <dd>{QY_REASON_LABELS[doc.reason]}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Hisob-kitob</dt>
            <dd>{doc.fromBonus ? "Bonus balansga qaytadi" : "YB qarzi kamayadi"}</dd>
          </div>
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
        <Table caption="Qaytarilgan partiyalar" density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">
          Jami: {formatQuantity(doc.totalQty)} dona
          {doc.totalAmount != null ? ` · ${formatMoney(doc.totalAmount)} soʻm (kirim narxida)` : ""}
        </p>
      </div>
      <Modal
        open={rejecting}
        onClose={() => setRejecting(false)}
        title="Qaytarishni rad etish"
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
        <TextField label="Sabab" value={reason} onChange={setReason} placeholder="Masalan: YB qabul qilmaydi" required />
      </Modal>
    </Drawer>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const create = useCreateSupplierReturn();
  const seen = useRef(new Map<string, string>());
  const [supplier, setSupplier] = useState<string | null>(null);
  const [supplierLabel, setSupplierLabel] = useState("");
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [reason, setReason] = useState<SupplierReturnReason | null>(null);
  const [note, setNote] = useState("");
  const [qty, setQty] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : null;
  const receipts = useReceipts(branchId, "POSTED", 1, supplier !== null, supplier ? Number(supplier) : null);
  const stock = useReturnStock(receiptId ? Number(receiptId) : null);

  const canApprove = can(me.data, QY_APPROVE);
  const all = stock.data ?? [];
  const zones = zonesOf(all);
  const zone = zones.find((z) => String(z.id) === zoneId) ?? (zones.length === 1 ? zones[0] : undefined);
  const rows = zone ? all.filter((r) => r.zone.id === zone.id) : [];
  const picked = returnLinesFrom(rows, qty);
  const withPrice = rows.some((r) => r.price != null);

  const columns: TableColumn<ReturnStockRow>[] = [
    {
      key: "productName",
      title: "Mahsulot",
      wrap: true,
      render: (r) => (
        <span className="flex items-center gap-2">
          {r.productName}
          {r.bonus ? <BonusBadge /> : null}
        </span>
      ),
    },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (r) => day(r.expiryDate) },
    ...(withPrice
      ? [
          {
            key: "price",
            title: "Kirim narxi",
            align: "right" as const,
            render: (r: ReturnStockRow) => (r.price != null ? formatMoney(r.price) : "—"),
          },
        ]
      : []),
    { key: "qty", title: "Qoldiq", align: "right", render: (r) => formatQuantity(r.qty) },
    { key: "reserved", title: "Zahirada", align: "right", render: (r) => (r.reserved ? formatQuantity(r.reserved) : "—") },
    {
      key: "ret",
      title: "Qaytarish",
      align: "right",
      render: (r) => (
        <div className="ml-auto w-28">
          <TextField
            label={`${r.productName} ${r.batchNumber} — qaytarish soni`}
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
    if (!receiptId) return setError("Yetkazib beruvchi va kirimni tanlang.");
    if (!zone) return setError("Zonani tanlang.");
    if (!reason) return setError("Sababni tanlang.");
    if (reason === "OTHER" && note.trim() === "") return setError("Sabab «Boshqa» — izoh yozing (nima boʻldi).");
    if (picked.error) return setError(picked.error);
    if (picked.lines.length === 0) return setError("Kamida bitta partiyaga qaytarish sonini kiriting.");
    create.mutate(
      { receiptId: Number(receiptId), zoneId: zone.id, reason, note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? "Tasdiqqa yuborildi" : "Tovar YB ga qaytarildi",
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
      title="Yangi qaytarish"
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!receiptId || !zone || !reason}>
          {canApprove ? "Qaytarish" : "Tasdiqqa yuborish"}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Qaytarilmadi">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Yetkazib beruvchi"
            value={supplier}
            loadOptions={async (q) => {
              const found = await searchSuppliers(q);
              found.forEach((o) => seen.current.set(o.value, o.label));
              return found;
            }}
            onChange={(v) => (
              setSupplier(v),
              setSupplierLabel(v ? (seen.current.get(v) ?? "") : ""),
              setReceiptId(null),
              setZoneId(null),
              setQty({})
            )}
            placeholder={supplierLabel || "Nom yoki STIR boʻyicha qidiring"}
            options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
            required
          />
          <Select
            label="Kirim"
            value={receiptId}
            onChange={(v) => (setReceiptId(v), setZoneId(null), setQty({}))}
            options={(receipts.data?.items ?? []).map((r) => ({
              value: String(r.id),
              label: `${r.number} · ${day(r.receiptDate)}`,
              sub: r.invoiceNumber ? `Yuk xati ${r.invoiceNumber}` : r.warehouse,
            }))}
            placeholder={supplier ? "Oʻtkazilgan kirimni tanlang" : "Avval yetkazib beruvchini tanlang"}
            disabled={!supplier}
            required
          />
          <Select
            label="Zona"
            value={zone ? String(zone.id) : null}
            onChange={(v) => (setZoneId(v), setQty({}))}
            options={zones.map((z) => ({ value: String(z.id), label: zoneLabel(z) }))}
            disabled={zones.length === 0}
            hint={receiptId && stock.data && zones.length === 0 ? "Bu kirim partiyalaridan qoldiq yoʻq" : undefined}
            required
          />
          <Select
            label="Sabab"
            value={reason}
            onChange={(v) => setReason(v as SupplierReturnReason | null)}
            options={Object.entries(QY_REASON_LABELS).map(([value, label]) => ({ value, label }))}
            required
          />
        </div>
        <Alert tone="info" title={canApprove ? "Siz tasdiqlaysiz" : "Tasdiq kerak"}>
          {canApprove
            ? "Hujjat darhol oʻtkaziladi: tovar zonadan chiqadi, YB qarzi kirim narxida kamayadi (bonus tovar — qarzga taʼsir qilmaydi)."
            : "Hujjat Filial rahbari yoki Ombor mudiri tasdigʻiga yuboriladi. Tasdiqlanmaguncha tovar zonada qoladi."}
        </Alert>
        {receiptId ? (
          stock.error ? (
            <ErrorState onRetry={() => stock.refetch()} />
          ) : zone || stock.isPending ? (
            <Table
              caption={zone ? `«${zone.name}» zonasidagi kirim partiyalari` : "Kirim partiyalari"}
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(r) => String(r.batchId)}
              loading={stock.isPending}
              emptyState={<EmptyState icon={X} title="Zonada bu kirim tovari yoʻq" description="Boshqa zonani tanlang." />}
            />
          ) : null
        ) : null}
        <TextField
          label="Izoh"
          value={note}
          onChange={setNote}
          placeholder="Masalan: qadoq ezilgan, YB bilan kelishilgan"
          required={reason === "OTHER"}
        />
      </div>
    </Drawer>
  );
}
