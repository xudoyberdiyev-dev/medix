"use client";

import { Check, ClipboardCheck, Lock, PackagePlus, Printer, RotateCcw, Save, ScanSearch, X } from "lucide-react";
import { useTranslations } from "next-intl";
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

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));
const signed = (n: number) => (n > 0 ? `+${formatQuantity(n)}` : formatQuantity(n));

export function InventoryCountDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("inventoryCounts");
  const KIND = t("title");
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
      <Drawer open onClose={props.onClose} size="lg" kind={KIND} title={t("drawer.loading")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  return <View key={doc.data.id} doc={doc.data} onClose={props.onClose} />;
}

function View({ doc, onClose }: { doc: InventoryCountDetail; onClose: () => void }) {
  const t = useTranslations("inventoryCounts");
  const KIND = t("title");
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
  const pendingError = pending.error ? t("errors.qty", pending.error) : null;
  const pct = progress(doc.lines);

  const fail = (e: unknown) =>
    toast({ tone: "danger", title: t("drawer.failed"), description: describeError(e).message ?? t("drawer.retryHint") });

  const saveDraft = (then?: () => void) => {
    if (pendingError) return setError(pendingError);
    if (pending.entries.length === 0) return then ? then() : undefined;
    save.mutate(
      { id: doc.id, entries: pending.entries },
      {
        onSuccess: () => {
          setDraft({});
          setError(null);
          if (then) then();
          else
            toast({
              tone: "success",
              title: t("drawer.countSaved"),
              description: t("drawer.linesCount", { count: pending.entries.length }),
            });
        },
        onError: (e) => setError(describeError(e).message ?? t("drawer.notSaved")),
      },
    );
  };

  const sendToCheck = () =>
    saveDraft(() =>
      submit.mutate(doc.id, {
        onSuccess: (d) => toast({ tone: "success", title: t("drawer.sentToCheck"), description: d.number }),
        onError: (e) => setError(describeError(e).message ?? t("drawer.notSent")),
      }),
    );

  const rows = doc.lines.filter((l) => {
    if (!onlyOpen) return true;
    if (counting) return l.countedQty == null && (draft[l.id] ?? "").trim() === "";
    return l.diff != null && l.diff !== 0;
  });

  const columns: TableColumn<InventoryCountLine>[] = [
    ...(doc.zone ? [] : [{ key: "zone", title: t("drawer.zone"), render: (l: InventoryCountLine) => l.zone.name }]),
    {
      key: "productName",
      title: t("drawer.product"),
      wrap: true,
      render: (l) => (
        <span className="flex flex-wrap items-center gap-2">
          <span>
            {l.productName}
            <span className="block font-mono text-caption text-text-secondary">{l.productCode}</span>
          </span>
          {l.controlled ? (
            <Badge tone="danger" icon={Lock}>
              {t("drawer.controlled")}
            </Badge>
          ) : null}
          {l.added ? (
            <Badge tone="info" icon={PackagePlus}>
              {t("drawer.found")}
            </Badge>
          ) : null}
        </span>
      ),
    },
    { key: "batchNumber", title: t("drawer.batch"), mono: true },
    { key: "expiryDate", title: t("drawer.expiry"), render: (l) => day(l.expiryDate) },
    ...(doc.bookHidden
      ? []
      : [
          {
            key: "bookQty",
            title: t("drawer.book"),
            align: "right" as const,
            render: (l: InventoryCountLine) => (l.bookQty != null ? formatQuantity(l.bookQty) : "—"),
          },
        ]),
    {
      key: "countedQty",
      title: t("drawer.counted"),
      align: "right",
      render: (l) =>
        canCount ? (
          <div className="ml-auto w-24">
            <TextField
              label={t("drawer.countedLabel", { product: l.productName, batch: l.batchNumber })}
              className="[&>label]:sr-only"
              value={draft[l.id] ?? (l.countedQty != null ? String(l.countedQty) : "")}
              onChange={(v) => (setDraft((d) => ({ ...d, [l.id]: v })), setError(null))}
              placeholder={t("drawer.qtyPlaceholder")}
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
            title: t("drawer.diff"),
            align: "right" as const,
            render: (l: InventoryCountLine) =>
              l.diff == null || l.diff === 0 ? "—" : <span className={l.diff < 0 ? "text-danger" : "text-success"}>{signed(l.diff)}</span>,
          },
        ]),
    ...(withCost && !doc.bookHidden && !counting
      ? [
          {
            key: "diffAmount",
            title: t("drawer.diffAmount"),
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
          {doc.status !== "DRAFT" && doc.status !== "CANCELLED" ? (
            <Button
              variant="tertiary"
              icon={Printer}
              onClick={() => window.open(`/api/inventory-counts/${doc.id}/pdf`, "_blank", "noopener")}
            >
              {counting ? t("drawer.printSheet") : t("drawer.printReport")}
            </Button>
          ) : null}
          {!finished && can(me.data, IN_CREATE) ? (
            <Button variant="tertiary" icon={X} onClick={() => setCancelling(true)}>
              {t("drawer.cancel")}
            </Button>
          ) : null}
          {doc.status === "DRAFT" && canOpen ? (
            <Button
              icon={ScanSearch}
              loading={start.isPending}
              onClick={() =>
                start.mutate(doc.id, {
                  onSuccess: (d) =>
                    toast({
                      tone: "success",
                      title: t("drawer.countOpened"),
                      description: t("drawer.linesCount", { count: d.lines.length }),
                    }),
                  onError: fail,
                })
              }
            >
              {t("drawer.openCount")}
            </Button>
          ) : null}
          {canCount ? (
            <>
              <Button variant="secondary" icon={Save} loading={save.isPending && !submit.isPending} onClick={() => saveDraft()}>
                {t("drawer.save")}
              </Button>
              <Button icon={ClipboardCheck} loading={submit.isPending} onClick={sendToCheck}>
                {t("drawer.sendToCheck")}
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
                    recount.mutate(doc.id, { onSuccess: () => toast({ tone: "info", title: t("drawer.sentToRecount") }), onError: fail })
                  }
                >
                  {t("drawer.recount")}
                </Button>
              ) : null}
              {level ? (
                <Button
                  icon={Check}
                  loading={approve.isPending}
                  onClick={() =>
                    approve.mutate(doc.id, {
                      onSuccess: (d) => toast({ tone: "success", title: t("drawer.approved"), description: d.number }),
                      onError: fail,
                    })
                  }
                >
                  {t("drawer.approve")}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("drawer.failed")}>
            {error}
          </Alert>
        ) : null}
        {doc.status === "DRAFT" ? (
          <Alert tone="info" title={t("drawer.draftTitle")}>
            {t("drawer.draftHint", {
              scope: doc.zone ? t("drawer.inZone", { name: doc.zone.name }) : t("drawer.inWholeWarehouse"),
            })}
          </Alert>
        ) : null}
        {counting ? (
          <Alert tone="warning" title={t("drawer.countingTitle", { pct: String(pct) })}>
            {t("drawer.countingHint", {
              scope: doc.zone ? t("drawer.inZoneStart", { name: doc.zone.name }) : t("drawer.inWarehouse"),
            })}
            {doc.bookHidden ? ` ${t("drawer.blindHint")}` : ""}
          </Alert>
        ) : null}
        {doc.status === "CHECK" ? (
          <Alert tone="warning" title={doc.needsDirector ? t("drawer.waitingDirector") : t("drawer.waitingApproval")}>
            {doc.needsDirector ? t("drawer.directorHint", { limit: formatMoney(IN_DIRECTOR_LIMIT) }) : t("drawer.managerHint")}{" "}
            {t("drawer.approveHint")}
          </Alert>
        ) : null}
        {doc.status === "CANCELLED" ? (
          <Alert tone="info" title={t("drawer.cancelledTitle", { reason: doc.cancelReason ?? "" })}>
            {t("drawer.cancelledBody", { name: doc.cancelledBy ?? "" })}
          </Alert>
        ) : null}
        <dl className="grid grid-cols-4 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">{t("drawer.scope")}</dt>
            <dd>
              {doc.warehouse} · {doc.zone ? doc.zone.name : t("drawer.wholeWarehouse")}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("drawer.counted")}</dt>
            <dd>{t("drawer.countedOf", { counted: formatQuantity(doc.counted), total: formatQuantity(doc.lines.length) })}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("drawer.shortage")}</dt>
            <dd>
              {t("drawer.pcs", { qty: formatQuantity(doc.shortageQty) })}
              {doc.shortageCost != null && doc.shortageQty ? ` · ${formatMoney(doc.shortageCost)}` : ""}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("drawer.surplus")}</dt>
            <dd>
              {t("drawer.pcs", { qty: formatQuantity(doc.surplusQty) })}
              {doc.surplusCost != null && doc.surplusQty ? ` · ${formatMoney(doc.surplusCost)}` : ""}
            </dd>
          </div>
          {doc.commission ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">{t("drawer.commission")}</dt>
              <dd>{doc.commission}</dd>
            </div>
          ) : null}
          {doc.note ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">{t("drawer.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
          {doc.startedBy ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">{t("drawer.startedBy")}</dt>
              <dd>
                {doc.startedBy}
                {doc.startedAt ? ` · ${formatDateTime(new Date(doc.startedAt))}` : ""}
              </dd>
            </div>
          ) : null}
          {doc.postedBy ? (
            <div className="col-span-2">
              <dt className="text-caption text-text-secondary">{t("drawer.postedBy")}</dt>
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
              <Checkbox label={counting ? t("drawer.onlyUncounted") : t("drawer.onlyDiff")} checked={onlyOpen} onChange={setOnlyOpen} />
              {canCount ? (
                <Button variant="secondary" size="sm" icon={PackagePlus} onClick={() => setAdding(true)}>
                  {t("drawer.foundBatch")}
                </Button>
              ) : null}
            </div>
            <Table
              caption={t("drawer.linesCaption")}
              density="compact"
              columns={columns}
              rows={rows}
              rowKey={(l) => String(l.id)}
              emptyState={
                <p className="p-6 text-center text-body text-text-secondary">{onlyOpen ? t("drawer.noSuchLines") : t("drawer.noGoods")}</p>
              }
            />
          </>
        ) : null}
      </div>
      <Modal
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={t("drawer.cancelTitle")}
        tone="danger"
        primaryAction={{
          label: t("drawer.cancel"),
          loading: cancel.isPending,
          disabled: cancelReason.trim() === "",
          onClick: () =>
            cancel.mutate(
              { id: doc.id, reason: cancelReason.trim() },
              { onSuccess: () => (setCancelling(false), toast({ tone: "success", title: t("drawer.cancelledUnlocked") })), onError: fail },
            ),
        }}
      >
        <TextField
          label={t("drawer.reason")}
          value={cancelReason}
          onChange={setCancelReason}
          placeholder={t("drawer.reasonPlaceholder")}
          required
        />
      </Modal>
      {adding ? <AddFound doc={doc} onClose={() => setAdding(false)} /> : null}
    </Drawer>
  );
}

/** Sanoqda topilgan, hisobda yoʻq partiya: qidirish → zona → soni. */
function AddFound({ doc, onClose }: { doc: InventoryCountDetail; onClose: () => void }) {
  const t = useTranslations("inventoryCounts");
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
    if (!batchId) return setError(t("errors.batch"));
    if (!zoneId) return setError(t("errors.zone"));
    if (!/^\d+$/.test(qty.trim()) || Number(qty) <= 0) return setError(t("errors.positiveQty"));
    save.mutate(
      { id: doc.id, entries: [{ zoneId: Number(zoneId), batchId: Number(batchId), countedQty: Number(qty) }] },
      {
        onSuccess: () => (toast({ tone: "success", title: t("addFound.added") }), onClose()),
        onError: (e) => setError(describeError(e).message ?? t("errors.notAdded")),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addFound.title")}
      primaryAction={{ label: t("addFound.add"), loading: save.isPending, onClick: add }}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("addFound.failed")}>
            {error}
          </Alert>
        ) : null}
        <TextField
          label={t("addFound.search")}
          value={q}
          onChange={(v) => (setQ(v), setBatchId(null))}
          placeholder={t("addFound.searchPlaceholder")}
          variant="search"
        />
        <Select
          label={t("addFound.batch")}
          value={batchId}
          onChange={setBatchId}
          disabled={(hits.data ?? []).length === 0}
          placeholder={q.trim().length < 2 ? t("addFound.searchFirst") : hits.isFetching ? t("addFound.searching") : t("addFound.notFound")}
          options={(hits.data ?? []).map((h) => ({
            value: String(h.batchId),
            label: `${h.productName} · ${h.batchNumber} · ${day(h.expiryDate)}`,
          }))}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t("addFound.zone")}
            value={zoneId}
            onChange={setZoneId}
            disabled={doc.zone != null}
            options={zones.map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
            }))}
            required
          />
          <TextField
            label={t("addFound.counted")}
            value={qty}
            onChange={setQty}
            inputMode="numeric"
            placeholder={t("addFound.qtyPlaceholder")}
            required
          />
        </div>
      </div>
    </Modal>
  );
}

function CreateForm({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("inventoryCounts");
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
    if (!warehouse) return setError(t("errors.warehouse"));
    create.mutate(
      {
        warehouseId: warehouse.id,
        zoneId: zoneId ? Number(zoneId) : undefined,
        blind,
        commission: commission.trim(),
        note: note.trim(),
      },
      {
        onSuccess: (d) => (toast({ tone: "success", title: t("create.draftCreated"), description: d.number }), onCreated(d.id)),
        onError: (e) => setError(describeError(e).message ?? t("drawer.notSaved")),
      },
    );
  };

  return (
    <Drawer
      open
      onClose={onClose}
      size="lg"
      kind={t("title")}
      title={t("create.title")}
      actions={
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!warehouse}>
          {t("create.submit")}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("create.failed")}>
            {error}
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t("create.warehouse")}
            value={warehouseId}
            onChange={(v) => (setWarehouseId(v), setZoneId(null))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label={t("create.zone")}
            value={zoneId}
            onChange={setZoneId}
            placeholder={t("create.wholeWarehouse")}
            options={(warehouse?.zones ?? []).map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${ZONE_LABELS[z.type]}`,
            }))}
            disabled={!warehouse}
          />
        </div>
        <Checkbox label={t("create.blind")} description={t("create.blindHint")} checked={blind} onChange={setBlind} />
        <Alert tone="info" title={t("create.howTitle")}>
          {t("create.how", { limit: formatMoney(IN_DIRECTOR_LIMIT) })}
        </Alert>
        <TextField
          label={t("create.commission")}
          value={commission}
          onChange={setCommission}
          placeholder={t("create.commissionPlaceholder")}
        />
        <TextField label={t("create.note")} value={note} onChange={setNote} placeholder={t("create.notePlaceholder")} />
      </div>
    </Drawer>
  );
}
