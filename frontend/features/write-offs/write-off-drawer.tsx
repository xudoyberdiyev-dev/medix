"use client";

import { CalendarX, Check, Printer, X } from "lucide-react";
import { useTranslations } from "next-intl";
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
import { useWarehouses, ZONE_LABELS, zoneLabel } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { useLineErrorText } from "@/features/zone-transfers/line-error";
import { formatDate, formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  fillExpired,
  HC_APPROVE,
  HC_DIRECTOR,
  HC_DIRECTOR_LIMIT,
  HC_REASONS,
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

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

export function WriteOffDrawer(props: { id: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const t = useTranslations("writeOffs");
  const tc = useTranslations("common");
  const doc = useWriteOff(props.id);
  if (props.id === null) return <CreateForm onClose={props.onClose} onCreated={props.onCreated} />;
  if (doc.error)
    return (
      <Drawer open onClose={props.onClose} size="lg" kind={t("kind")} title="HC">
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

function View({ doc, onClose }: { doc: WriteOffDetail; onClose: () => void }) {
  const t = useTranslations("writeOffs");
  const me = useMe();
  const approve = useApproveWriteOff();
  const reject = useRejectWriteOff();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const level = can(me.data, HC_APPROVE) && (!doc.needsDirector || can(me.data, HC_DIRECTOR));
  const canDecide = doc.status === "PENDING" && level;
  const withCost = doc.totalCost != null;
  const columns: TableColumn<WriteOffDetail["lines"][number]>[] = [
    { key: "productCode", title: t("col.code"), mono: true },
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    { key: "expiryDate", title: t("col.expiry"), render: (l) => day(l.expiryDate) },
    { key: "qty", title: t("col.count"), align: "right", render: (l) => formatQuantity(l.qty) },
    ...(withCost
      ? [
          {
            key: "cost",
            title: t("col.cost"),
            align: "right" as const,
            render: (l: WriteOffDetail["lines"][number]) => (l.cost != null ? formatMoney(l.cost) : "—"),
          },
          {
            key: "amount",
            title: t("col.amount"),
            align: "right" as const,
            render: (l: WriteOffDetail["lines"][number]) => (l.amount != null ? formatMoney(l.amount) : "—"),
          },
        ]
      : []),
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
      status={<WriteOffStatusBadge status={doc.status} />}
      actions={
        <>
          <Button variant="tertiary" icon={Printer} onClick={() => window.open(`/api/write-offs/${doc.id}/pdf`, "_blank", "noopener")}>
            {t("view.print")}
          </Button>
          {canDecide ? (
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
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {doc.status === "PENDING" ? (
          <Alert tone="warning" title={doc.needsDirector ? t("view.pendingDirectorTitle") : t("view.pendingTitle")}>
            {doc.needsDirector
              ? t("view.pendingDirectorBody", { limit: formatMoney(HC_DIRECTOR_LIMIT), zone: doc.zone.name })
              : t("view.pendingBody", { zone: doc.zone.name })}
          </Alert>
        ) : null}
        {doc.status === "REJECTED" ? (
          <Alert tone="info" title={t("view.rejectedTitle", { reason: doc.rejectReason ?? "" })}>
            {t("view.rejectedBody", { who: doc.rejectedBy ?? "" })}
          </Alert>
        ) : null}
        <dl className="grid grid-cols-3 gap-4 text-body">
          <div>
            <dt className="text-caption text-text-secondary">{t("view.warehouseZone")}</dt>
            <dd>
              {doc.warehouse} · {doc.zone.name}
            </dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.reason")}</dt>
            <dd>{t(`reason.${doc.reason}`)}</dd>
          </div>
          <div>
            <dt className="text-caption text-text-secondary">{t("view.act")}</dt>
            <dd>{doc.actNo ?? "—"}</dd>
          </div>
          {doc.sourceTransfer ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.source")}</dt>
              <dd>{t("view.sourceBody", { number: doc.sourceTransfer })}</dd>
            </div>
          ) : null}
          {doc.commission ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.commission")}</dt>
              <dd>{doc.commission}</dd>
            </div>
          ) : null}
          {doc.note ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.note")}</dt>
              <dd>{doc.note}</dd>
            </div>
          ) : null}
          {doc.postedBy ? (
            <div className="col-span-3">
              <dt className="text-caption text-text-secondary">{t("view.postedBy")}</dt>
              <dd>
                {doc.postedBy}
                {doc.postedAt ? ` · ${formatDateTime(new Date(doc.postedAt))}` : ""}
              </dd>
            </div>
          ) : null}
        </dl>
        <Table caption={t("view.linesCaption")} density="compact" columns={columns} rows={doc.lines} rowKey={(l) => String(l.id)} />
        <p className="text-right text-caption text-text-secondary">
          {t("view.total", { qty: formatQuantity(doc.totalQty) })}
          {doc.totalCost != null ? ` · ${t("view.totalCost", { amount: formatMoney(doc.totalCost) })}` : ""}
        </p>
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
  const t = useTranslations("writeOffs");
  const lineError = useLineErrorText();
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
    { key: "productName", title: t("col.product"), wrap: true },
    { key: "batchNumber", title: t("col.batch"), mono: true },
    {
      key: "expiryDate",
      title: t("col.expiry"),
      render: (r) =>
        r.expired ? (
          <Badge tone="danger" icon={CalendarX}>
            {t("form.expiredBadge", { date: day(r.expiryDate) })}
          </Badge>
        ) : (
          day(r.expiryDate)
        ),
    },
    { key: "qty", title: t("col.stock"), align: "right", render: (r) => formatQuantity(r.qty) },
    { key: "reserved", title: t("col.reserved"), align: "right", render: (r) => (r.reserved ? formatQuantity(r.reserved) : "—") },
    {
      key: "writeOff",
      title: t("col.writeOff"),
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
    if (!zone) return setError(t("form.pickZone"));
    if (!reason) return setError(t("form.pickReason"));
    if (reason === "OTHER" && note.trim() === "") return setError(t("form.otherNote"));
    if (picked.error) return setError(lineError(picked.error));
    if (picked.lines.length === 0) return setError(t("form.noLines"));
    create.mutate(
      { zoneId: zone.id, reason, actNo: actNo.trim(), commission: commission.trim(), note: note.trim(), lines: picked.lines },
      {
        onSuccess: (d) => {
          toast({
            tone: "success",
            title: d.status === "PENDING" ? t("form.sent") : t("form.done"),
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
        <Button icon={Check} loading={create.isPending} onClick={submit} disabled={!zone || !reason}>
          {canApprove ? t("form.submit") : t("form.sendForApproval")}
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
            onChange={(v) => (setWarehouseId(v), setZoneId(null), setQty({}))}
            options={active.map((w) => ({ value: String(w.id), label: w.name }))}
            required
          />
          <Select
            label={t("form.zone")}
            value={zoneId}
            onChange={(v) => (setZoneId(v), setQty({}))}
            options={zones.map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${zoneLabel(z.type)}`,
            }))}
            disabled={!warehouse}
            required
          />
          <Select
            label={t("form.reason")}
            value={reason}
            onChange={(v) => setReason(v as WriteOffReason | null)}
            options={HC_REASONS.map((value) => ({ value, label: t(`reason.${value}`) }))}
            required
          />
        </div>
        <Alert tone="info" title={canApprove ? t("form.selfApproveTitle") : t("form.needApprovalTitle")}>
          {canApprove
            ? t("form.selfApproveBody", { limit: formatMoney(HC_DIRECTOR_LIMIT) })
            : t("form.needApprovalBody", { limit: formatMoney(HC_DIRECTOR_LIMIT) })}
        </Alert>
        {zone ? (
          stock.error ? (
            <ErrorState onRetry={() => stock.refetch()} />
          ) : (
            <>
              {reason === "EXPIRED" && expiredCount > 0 ? (
                <div>
                  <Button variant="secondary" size="sm" icon={CalendarX} onClick={() => setQty(fillExpired(rows))}>
                    {t("form.fillExpired", { count: String(expiredCount) })}
                  </Button>
                </div>
              ) : null}
              <Table
                caption={t("form.stockCaption", { zone: zone.name })}
                density="compact"
                columns={columns}
                rows={rows}
                rowKey={(r) => String(r.batchId)}
                loading={stock.isPending}
                emptyState={<EmptyState icon={X} title={t("form.emptyZoneTitle")} description={t("form.emptyZoneHint")} />}
              />
            </>
          )
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <TextField label={t("form.actNo")} value={actNo} onChange={setActNo} placeholder={t("form.actNoPlaceholder")} />
          <TextField
            label={t("form.commission")}
            value={commission}
            onChange={setCommission}
            placeholder={t("form.commissionPlaceholder")}
          />
        </div>
        <TextField
          label={t("form.note")}
          value={note}
          onChange={setNote}
          placeholder={t("form.notePlaceholder")}
          required={reason === "OTHER"}
        />
      </div>
    </Drawer>
  );
}
