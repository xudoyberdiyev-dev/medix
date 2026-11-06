"use client";

import { Check, ClipboardCheck, Lock, PackagePlus, RotateCcw, Save, ScanSearch, X } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useWarehouses, ZONE_LABELS } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  changedEntries,
  IN_APPROVE,
  IN_COUNT,
  IN_CREATE,
  IN_DIRECTOR,
  IN_DIRECTOR_LIMIT,
  IN_OPEN,
  progress,
  useApproveInventoryCount,
  useCancelInventoryCount,
  useCreateInventoryCount,
  useInventoryBatches,
  useInventoryCount,
  useRecountInventoryCount,
  useSaveCounts,
  useStartInventoryCount,
  useSubmitInventoryCount,
  type InventoryCountDetail,
  type InventoryCountLine,
} from "./api";
import { InventoryCountStatusBadge } from "./inventory-counts-page";

const KIND = "Inventarizatsiya";
const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const signed = (n: number) => (n > 0 ? `+${formatQuantity(n)}` : formatQuantity(n));

export function InventoryCountDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const doc = useInventoryCount(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="IN">
        <ErrorState onRetry={() => doc.refetch()} />
      </Drawer>
    );
  if (!doc.data)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title="Yuklanmoqda…">
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  return <View key={doc.data.id} doc={doc.data} onClose={props.onClose} />;
}

function View({ doc, onClose }: { doc: InventoryCountDetail; onClose: () => void }) {
  const me = useMe();
  const start = useStartInventoryCount();
  const save = useSaveCounts();
  const submit = useSubmitInventoryCount();
  const recount = useRecountInventoryCount();
  const approve = useApproveInventoryCount();
  const cancel = useCancelInventoryCount();
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [adding, setAdding] = useState(false);

  const counting = doc.status === "COUNTING";
  const finished = doc.status === "POSTED" || doc.status === "CANCELLED";
  const canCount = counting && can(me.data, IN_COUNT);
  const canOpen = can(me.data, IN_OPEN);
  const level = can(me.data, IN_APPROVE) && (!doc.needsDirector || can(me.data, IN_DIRECTOR));
  const withCost = doc.lines.some((l) => l.cost != null);
  const pending = changedEntries(doc.lines, draft);
  const pct = progress(doc.lines);

  const fail = (e: unknown) =>
    toast({ tone: "danger", title: "Bajarilmadi", description: describeError(e).message ?? "Qayta urinib koʻring." });

  const saveDraft = (then?: () => void) => {
    if (pending.error) return setError(pending.error);
    if (pending.entries.length === 0) return then ? then() : undefined;
    save.mutate(
      { id: doc.id, entries: pending.entries },
      {
        onSuccess: () => {
          setDraft({});
          setError(null);
          if (then) then();
          else toast({ tone: "success", title: "Sanoq saqlandi", description: `${pending.entries.length} ta qator` });
        },
        onError: (e) => setError(describeError(e).message ?? "Saqlanmadi. Qayta urinib koʻring."),
      },
    );
  };

  const sendToCheck = () =>
    saveDraft(() =>
      submit.mutate(doc.id, {
        onSuccess: (d) => toast({ tone: "success", title: "Tekshiruvga yuborildi", description: d.number }),
        onError: (e) => setError(describeError(e).message ?? "Yuborilmadi. Qayta urinib koʻring."),
      }),
    );

  const rows = doc.lines.filter((l) => {
    if (!onlyOpen) return true;
    if (counting) return l.countedQty == null && (draft[l.id] ?? "").trim() === "";
    return l.diff != null && l.diff !== 0;
  });

  const columns: TableColumn<InventoryCountLine>[] = [
    ...(doc.zone ? [] : [{ key: "zone", title: "Zona", render: (l: InventoryCountLine) => l.zone.name }]),
    {
      key: "productName",
      title: "Mahsulot",
      wrap: true,
      render: (l) => (
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {l.productName}
            <span className="block font-mono text-caption text-text-secondary">{l.productCode}</span>
          </span>
          {l.controlled ? (
            <Badge tone="danger" icon={Lock}>
              Nazoratda
            </Badge>
          ) : null}
          {l.added ? (
            <Badge tone="info" icon={PackagePlus}>
              Topildi
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: "batchNumber", title: "Partiya", mono: true },
    { key: "expiryDate", title: "Yaroqlilik", render: (l) => day(l.expiryDate) },
    ...(doc.bookHidden
      ? []
      : [
          {
            key: "bookQty",
            title: "Hisobda",
            align: "right" as const,
            render: (l: InventoryCountLine) => (l.bookQty != null ? formatQuantity(l.bookQty) : "—"),
          },
        ]),
    {
      key: "countedQty",
      title: "Sanaldi",
      align: "right",
      render: (l) =>
        canCount ? (
          <div className="ml-auto w-24">
            <TextField
              label={`${l.productName} ${l.batchNumber} — sanalgan soni`}
              className="[&>label]:sr-only"
              value={draft[l.id] ?? (l.countedQty != null ? String(l.countedQty) : "")}
              onChange={(v) => (setDraft((d) => ({ ...d, [l.id]: v })), setError(null))}
              placeholder="soni"
              inputMode="numeric"
            />
          </div>
        ) : l.countedQty != null ? (
          formatQuantity(l.countedQty)
        ) : (
          "—"
        ),
    },
    ...(doc.bookHidden
      ? []
      : [
          {
            key: "diff",
            title: "Farq",
            align: "right" as const,
            render: (l: InventoryCountLine) =>
              l.diff == null || l.diff === 0 ? "—" : <span className={l.diff < 0 ? "text-danger" : "text-success"}>{signed(l.diff)}</span>,
          },
        ]),
    ...(withCost && !doc.bookHidden && !counting
      ? [
          {
            key: "diffAmount",
            title: "Farq summasi",
            align: "right" as const,
            render: (l: InventoryCountLine) => (l.diffAmount != null && l.diff ? formatMoney(l.diffAmount) : "—"),
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
      status={<InventoryCountStatusBadge status={doc.status} />}
      actions={
        <>
          {!finished && can(me.data, IN_CREATE) ? (
            <Button variant="tertiary" icon={X} onClick={() => setCancelling(true)}>
              Bekor qilish
            </Button>
          ) : null}
          {doc.status === "DRAFT" && canOpen ? (
            <Button
              icon={ScanSearch}
              loading={start.isPending}
              onClick={() =>
                start.mutate(doc.id, {
                  onSuccess: (d) => toast({ tone: "success", title: "Sanoq ochildi", description: `${d.lines.length} ta qator` }),
                  onError: fail,
                })
              }
            >
              Sanoqni ochish
            </Button>
          ) : null}
          {canCount ? (
            <>
              <Button variant="secondary" icon={Save} loading={save.isPending && !submit.isPending} onClick={() => saveDraft()}>
                Saqlash
              </Button>
              <Button icon={ClipboardCheck} loading={submit.isPending} onClick={sendToCheck}>
                Tekshiruvga yuborish
              </Button>
            </>
          ) : null}
          {doc.status === "CHECK" ? (
            <>
              {canOpen ? (
                <Button
                  variant="secondary"
                  icon={RotateCcw}
                  loading={recount.isPending}
                  onClick={() =>
                    recount.mutate(doc.id, { onSuccess: () => toast({ tone: "info", title: "Qayta sanashga qaytarildi" }), onError: fail })
                  }
                >
                  Qayta sanash
                </Button>
              ) : null}
              {level ? (
                <Button
                  icon={Check}
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(doc.id, {
                      onSuccess: (d) => toast({ tone: "success", title: "Tasdiqlandi, qoldiq tuzatildi", description: d.number }),
                      onError: fail,
                    })
                  }
                >
                  Tasdiqlash
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Bajarilmadi">
            {error}
          </Alert>
        ) : null}
        {doc.status === "DRAFT" ? (
          <Alert tone="info" title="Sanoq hali ochilmagan">
            Sanoq ochilganda hisobdagi qoldiq qayd etiladi va {doc.zone ? `«${doc.zone.name}» zonasida` : "butun omborda"} ombor harakatlari
            (kirim, yigʻish, koʻchirish) sanoq tugaguncha toʻxtatiladi.
          </Alert>
        ) : null}
        {counting ? (
          <Alert tone="warning" title={`Sanoq ketmoqda · ${pct}%`}>
            {doc.zone ? `«${doc.zone.name}» zonasida` : "Omborda"} ombor harakatlari toʻxtatilgan. Har bir partiyani sanab miqdorini
            kiriting (yoʻq boʻlsa — 0).{doc.bookHidden ? " Koʻr sanoq: hisobdagi qoldiq koʻrsatilmaydi." : ""}
          </Alert>
        ) : null}
        {doc.status === "CHECK" ? (
          <Alert tone="warning" title={doc.needsDirector ? "Direktor tasdigʻi kutilmoqda" : "Tasdiq kutilmoqda"}>
            {doc.needsDirector
              ? `Kamomad tannarxi ${formatMoney(IN_DIRECTOR_LIMIT)} dan katta yoki nazoratdagi tovarda farq bor — Direktor tasdiqlaydi. `
              : "Filial rahbari yoki Direktor tasdiqlaydi. "}
            Tasdiqlanganda farqlar qoldiqqa yoziladi va qulf yechiladi.
          </Alert>
        ) : null}
        {doc.status === "CANCELLED" ? (
          <Alert tone="info" title={`Bekor qilindi: ${doc.cancelReason ?? ""}`}>
            {doc.cancelledBy} — qoldiq oʻzgarmadi.
          </Alert>
        ) : null}
        <dl className="grid grid-cols-4 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">Ombor · qamrov</dt>
            <dd>
              {doc.warehouse} · {doc.zone ? doc.zone.name : "butun ombor"}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Sanaldi</dt>
            <dd>
              {formatQuantity(doc.counted)} / {formatQuantity(doc.lines.length)} qator
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Kamomad</dt>
            <dd>
              {formatQuantity(doc.shortageQty)} dona
              {doc.shortageCost != null && doc.shortageQty ? ` · ${formatMoney(doc.shortageCost)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">Ortiqcha</dt>
            <dd>
              {formatQuantity(doc.surplusQty)} dona
              {doc.surplusCost != null && doc.surplusQty ? ` · ${formatMoney(doc.surplusCost)}` : ""}
            </dd>
          </div>
          {doc.commission ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">Komissiya</dt>
              <dd>{doc.commission}</dd>
            </div>
          ) : null}
          {doc.note ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">Izoh</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
          {doc.startedBy ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">Sanoqni ochdi</dt>
              <dd>
                {doc.startedBy}
                {doc.startedAt ? ` · ${formatDateTime(new Date(doc.startedAt))}` : ""}
              </dd>
            </div>
          ) : null}
          {doc.postedBy ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">Tasdiqladi</dt>
              <dd>
                {doc.postedBy}
                {doc.postedAt ? ` · ${formatDateTime(new Date(doc.postedAt))}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        {doc.status !== "DRAFT" ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <Checkbox label={counting ? "Faqat sanalmaganlar" : "Faqat farqi borlar"} checked={onlyOpen} onChange={setOnlyOpen} />
              {canCount ? (
                <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setAdding(true)}>
                  Topilgan partiya
                </Button>
              ) : null}
            </div>
            <Table
              caption="Sanoq qatorlari"
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(l) => String(l.id)}
              emptyState={
                <p className="p-6 text-center text-body text-text-secondary">
                  {onlyOpen ? "Bunday qator yoʻq." : "Qamrovda tovar yoʻq — topilgan partiyani qoʻshing yoki bekor qiling."}
                </p>
              }
            />
          </>
        ) : null}
      </div>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title="Inventarizatsiyani bekor qilish"
        tone="danger"
        primaryAction={{
          label: "Bekor qilish",
          loading: cancel.isPending,
          disabled: cancelReason.trim() === "",
          onClick: () =>
            cancel.mutate(
              { id: doc.id, reason: cancelReason.trim() },
              { onSuccess: () => (setCancelling(false), toast({ tone: "success", title: "Bekor qilindi, qulf yechildi" })), onError: fail },
            ),
        }}
      >
        <TextField label="Sabab" value={cancelReason} onChange={setCancelReason} placeholder="Masalan: komissiya toʻliq emas" required />
      </Modal>
      {adding ? <AddFound doc={doc} onClose={() => setAdding(false)} /> : null}
    </Drawer>
  );
}

/** Sanoqda topilgan, hisobda yoʻq partiya: qidirish → zona → soni. */
function AddFound({ doc, onClose }: { doc: InventoryCountDetail; onClose: () => void }) {
  const warehouses = useWarehouses();
  const save = useSaveCounts();
  const [q, setQ] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(doc.zone ? String(doc.zone.id) : null);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hits = useInventoryBatches(doc.id, q);
  const zones = doc.zone ? [doc.zone] : ((warehouses.data ?? []).find((w) => w.id === doc.warehouseId)?.zones ?? []);

  const add = () => {
    if (!batchId) return setError("Partiyani tanlang.");
    if (!zoneId) return setError("Zonani tanlang.");
    if (!/^\d+$/.test(qty.trim()) || Number(qty) <= 0) return setError("Soni musbat butun son boʻlishi kerak.");
    save.mutate(
      { id: doc.id, entries: [{ zoneId: Number(zoneId), batchId: Number(batchId), countedQty: Number(qty) }] },
      {
        onSuccess: () => (toast({ tone: "success", title: "Topilgan partiya qoʻshildi" }), onClose()),
        onError: (e) => setError(describeError(e).message ?? "Qoʻshilmadi. Qayta urinib koʻring."),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Topilgan partiyani qoʻshish"
      primaryAction={{ label: "Qoʻshish", loading: save.isPending, onClick: add }}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Qoʻshilmadi">
            {error}
          </Alert>
        ) : null}
        <TextField
          label="Partiya raqami, mahsulot kodi yoki nomi"
          value={q}
          onChange={(v) => (setQ(v), setBatchId(null))}
          placeholder="Kamida 2 belgi"
          variant="search"
        />
        <Select
          label="Partiya"
          value={batchId}
          onChange={setBatchId}
          disabled={(hits.data ?? []).length === 0}
          placeholder={q.trim().length < 2 ? "Avval qidiring" : hits.isFetching ? "Qidirilmoqda…" : "Topilmadi"}
          options={(hits.data ?? []).map((h) => ({
            value: String(h.batchId),
            label: `${h.productName} · ${h.batchNumber} · ${day(h.expiryDate)}`,
          }))}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Zona"
            value={zoneId}
            onChange={setZoneId}
            disabled={doc.zone != null}
            options={zones.map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
            }))}
            required
          />
          <TextField label="Sanaldi" value={qty} onChange={setQty} inputMode="numeric" placeholder="soni" required />
        </div>
      </div>
    </Modal>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const warehouses = useWarehouses();
  const create = useCreateInventoryCount();
  const [warehouseId, setWarehouseId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(null);
  const [blind, setBlind] = useState(false);
  const [commission, setCommission] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = (warehouses.data ?? []).filter((w) => w.active);
  const warehouse = active.find((w) => String(w.id) === warehouseId);

  const submit = () => {
    if (!warehouse) return setError("Omborni tanlang.");
    create.mutate(
      {
        warehouseId: warehouse.id,
        zoneId: zoneId ? Number(zoneId) : undefined,
        blind,
        commission: commission.trim(),
        note: note.trim(),
      },
      {
        onSuccess: (d) => (toast({ tone: "success", title: "Qoralama yaratildi", description: d.number }), onCreated(d.id)),
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
      title="Yangi inventarizatsiya"
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!warehouse}>
          Qoralama yaratish
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title="Yaratilmadi">
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label="Ombor"
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setZoneId(null))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label="Zona"
            value={zoneId}
            onChange={setZoneId}
            placeholder="Butun ombor"
            options={(warehouse?.zones ?? []).map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
            }))}
            disabled={!warehouse}
          />
        </div>
        <Checkbox
          label="Koʻr sanoq"
          description="Sanovchi hisobdagi qoldiqni koʻrmaydi — faqat sanaydi."
          checked={blind}
          onChange={setBlind}
        />
        <Alert tone="info" title="Qanday ishlaydi">
          Qoralama → sanoqni ochish (qoldiq qayd etiladi, qamrovdagi ombor harakatlari toʻxtaydi) → sanash → tekshiruv → tasdiq. Kamomad
          tannarxi {formatMoney(IN_DIRECTOR_LIMIT)} dan katta yoki nazoratdagi tovarda farq boʻlsa — Direktor tasdiqlaydi.
        </Alert>
        <TextField label="Komissiya" value={commission} onChange={setCommission} placeholder="F.I.Sh., vergul bilan" />
        <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: oylik inventarizatsiya" />
      </div>
    </Drawer>
  );
}
