"use client";

import { ArrowLeftRight, CheckCheck, FileText, Layers, PackageCheck, ShieldAlert, Truck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { useBranchList, useWarehouses, zoneLabel } from "@/features/organization/api";
import { Steps } from "@/features/payments/payment-doc-page";
import { describeError } from "@/features/setup/form-error";
import { cn } from "@/lib/cn";
import { formatDate, formatDateTime, formatQuantity } from "@/lib/format";
import { TRANSFER_RECEIVE, useReceiveWarehouseTransfer, useWarehouseTransfer, type WarehouseTransferDetail } from "./api";
import { okSteps } from "./doc-model";
import { RECEIVE_REASONS, receivePlan, type ReceiveReason, type ReceiveRow, type RowError } from "./receive-model";
import { WarehouseTransferStatusBadge } from "./warehouse-transfers-page";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** OK qabul qilish — toʻliq sahifa (prototip `TransferReceive`). */
export function WarehouseTransferReceivePage({ id }: { id: number }) {
  const t = useTranslations("warehouseTransfers.doc");
  const me = useMe();
  const doc = useWarehouseTransfer(id);
  if (me.data && !can(me.data, TRANSFER_RECEIVE)) return <ForbiddenState />;
  if (doc.error) return <ErrorState onRetry={() => doc.refetch()} />;
  if (!doc.data)
    return (
      <div className="flex flex-col gap-4" aria-label={t("loading")}>
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <Receive doc={doc.data} />;
}

function Receive({ doc }: { doc: WarehouseTransferDetail }) {
  const t = useTranslations("warehouseTransfers.doc");
  const tr = useTranslations("warehouseTransfers.rcv");
  const router = useRouter();
  const branches = useBranchList();
  const warehouses = useWarehouses();
  const receive = useReceiveWarehouseTransfer();
  const zones = (warehouses.data?.find((w) => w.id === doc.toWarehouse.id)?.zones ?? []).filter((z) => z.active);
  const defZone = zones.find((z) => z.type === "MAIN") ?? zones.find((z) => z.type === "RECEIVING") ?? null;
  const [rows, setRows] = useState<Record<number, Partial<ReceiveRow>>>({});
  const [tried, setTried] = useState(false);
  const [confirm, setConfirm] = useState(false);

  const branch = branches.data?.find((b) => b.id === doc.branchId)?.name ?? "";
  const place = (w: string) => (branch ? `${branch} · ${w}` : w);
  const fromPlace = place(doc.fromWarehouse.name);
  const toPlace = place(doc.toWarehouse.name);
  const full: Record<number, ReceiveRow> = Object.fromEntries(
    doc.lines.map((l) => {
      const r = rows[l.id] ?? {};
      return [
        l.id,
        { recv: r.recv ?? String(l.qty), reason: r.reason ?? null, zoneId: r.zoneId !== undefined ? r.zoneId : (defZone?.id ?? null) },
      ];
    }),
  );
  const plan = receivePlan(doc.lines, full);
  const hasErrors = Object.keys(plan.errors).length > 0;
  const setRow = (id: number, v: Partial<ReceiveRow>) => setRows((s) => ({ ...s, [id]: { ...s[id], ...v } }));
  const zoneName = (id: number | null) => zones.find((z) => z.id === id)?.name ?? "";
  const errText = (e: RowError) =>
    e.kind === "num"
      ? tr("eNum")
      : e.kind === "over"
        ? tr("eOver", { n: formatQuantity(e.sent) })
        : e.kind === "reason"
          ? tr("eReason")
          : tr("eZone");
  const steps = okSteps(doc.status).map((s) => ({ label: t(`step.${s.key}`), state: s.state }));

  if (doc.status !== "IN_TRANSIT")
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="info" title={tr("notTransit")}>
          <Button variant="secondary" icon={FileText} onClick={() => router.push(`/warehouse-transfers/${doc.id}`)}>
            {tr("openDoc")}
          </Button>
        </Alert>
      </div>
    );

  const submit = () => {
    setTried(true);
    if (hasErrors) return;
    setConfirm(true);
  };
  const post = () =>
    receive.mutate(
      { id: doc.id, body: { toZoneId: plan.lines[0]?.toZoneId ?? defZone?.id ?? 0, note: "", lines: plan.lines } },
      {
        onSuccess: (d) => {
          setConfirm(false);
          toast({
            tone: d.shortageQty > 0 ? "warning" : "success",
            title: d.shortageQty > 0 || plan.damaged > 0 ? tr("tDiff", { n: d.number }) : tr("tDone", { n: d.number }),
          });
          router.push(`/warehouse-transfers/${doc.id}`);
        },
        onError: (e) => toast({ tone: "danger", title: tr("failed"), description: describeError(e).message ?? tr("retry") }),
      },
    );

  const shortage = plan.diff - plan.damaged;
  return (
    <div className="flex min-w-0 flex-col gap-4 pb-28">
      <DocumentHeader
        parent={{ label: t("parent"), href: "/transfers" }}
        crumb={doc.number}
        crumbMono
        title={tr("title")}
        number={doc.number}
        status={<WarehouseTransferStatusBadge status={doc.status} />}
        sub={
          <span className="inline-flex items-center gap-1">
            <ArrowLeftRight size={14} strokeWidth={1.5} aria-hidden />
            {fromPlace} → {toPlace}
          </span>
        }
        meta={<Steps steps={steps} />}
        actions={
          <RowMenu
            label={t("more")}
            items={[
              {
                key: "doc",
                label: tr("openDoc"),
                icon: <FileText size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () => router.push(`/warehouse-transfers/${doc.id}`),
              },
            ]}
          />
        }
      />
      <Alert
        tone="info"
        icon={Truck}
        title={t("bTransitT", { at: doc.sentAt ? formatDateTime(new Date(doc.sentAt)) : "", who: doc.sentBy ?? "" })}
      >
        {tr("info", { f: fromPlace, t: toPlace })}
      </Alert>
      {tried && hasErrors ? (
        <Alert tone="danger" title={tr("errT")}>
          {tr("errD")}
        </Alert>
      ) : null}
      <section className="rounded-card border border-border bg-surface">
        <h2 className="flex items-center gap-2 px-5 py-4 text-subtitle">
          {t("lines")}
          <span className="font-normal text-text-secondary">{doc.lines.length}</span>
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-table">
            <thead className="border-y border-border bg-table-header text-left text-caption text-text-secondary">
              <tr>
                <th className="px-4 py-2.5 font-medium">{t("cProduct")}</th>
                <th className="px-2 py-2.5 text-right font-medium">{t("cSent")}</th>
                <th className="w-36 px-2 py-2.5 font-medium">
                  {t("cReceived")} <span className="text-danger">*</span>
                </th>
                <th className="px-2 py-2.5 text-right font-medium">{t("cDiff")}</th>
                <th className="px-2 py-2.5 font-medium">{tr("cReason")}</th>
                <th className="w-56 px-4 py-2.5 font-medium">{t("cToZone")}</th>
              </tr>
            </thead>
            <tbody>
              {doc.lines.map((l) => {
                const r = full[l.id];
                const errs = tried ? (plan.errors[l.id] ?? []) : [];
                const n = /^\d+$/.test(r.recv.trim()) ? Number(r.recv.trim()) : NaN;
                const d = Number.isNaN(n) ? 0 : l.qty - n;
                const qtyErr = errs.find((e) => e.kind === "num" || e.kind === "over");
                const reasonErr = errs.find((e) => e.kind === "reason");
                const zoneErr = errs.find((e) => e.kind === "zone");
                return (
                  <tr key={l.id} className="border-b border-border align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-primary">{l.productName}</p>
                      <p className="font-mono text-caption text-text-secondary">
                        {l.batchNumber} · {day(l.expiryDate)}
                      </p>
                    </td>
                    <td className="px-2 py-3 text-right tabular-nums">{formatQuantity(l.qty)}</td>
                    <td className="px-2 py-2">
                      <div className="ml-auto w-32">
                        <TextField
                          label={tr("recvLabel", { p: l.productName, b: l.batchNumber })}
                          className="[&>label]:sr-only"
                          value={r.recv}
                          onChange={(v) => setRow(l.id, { recv: v })}
                          inputMode="numeric"
                          error={qtyErr ? errText(qtyErr) : undefined}
                        />
                      </div>
                    </td>
                    <td className={cn("px-2 py-3 text-right tabular-nums", d > 0 ? "font-semibold text-danger" : "text-text-secondary")}>
                      {d > 0 ? `−${formatQuantity(d)}` : "0"}
                    </td>
                    <td className="px-2 py-2">
                      {d > 0 ? (
                        <div className="flex flex-col gap-1">
                          <div role="radiogroup" aria-label={tr("cReason")} className="flex flex-wrap gap-1.5">
                            {RECEIVE_REASONS.map((o) => (
                              <ReasonChip
                                key={o}
                                on={r.reason === o}
                                label={tr(`r_${o}`)}
                                onPick={() => setRow(l.id, { reason: o as ReceiveReason })}
                              />
                            ))}
                          </div>
                          {reasonErr ? <span className="text-caption text-danger">{errText(reasonErr)}</span> : null}
                          {r.reason === "DAMAGED" ? (
                            <span className="inline-flex items-center gap-1 text-caption text-warning">
                              <ShieldAlert size={14} strokeWidth={1.5} aria-hidden />
                              {tr("dmg", { q: formatQuantity(d) })}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-text-secondary">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <Select
                        label={tr("zoneLabel", { p: l.productName })}
                        className="[&>span:first-child]:sr-only"
                        value={r.zoneId !== null ? String(r.zoneId) : null}
                        onChange={(v) => setRow(l.id, { zoneId: v ? Number(v) : null })}
                        options={zones.map((z) => ({
                          value: String(z.id),
                          label: z.name,
                          sub: zoneLabel(z.type) !== z.name ? zoneLabel(z.type) : undefined,
                        }))}
                        error={zoneErr ? errText(zoneErr) : undefined}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={t("cSent")} value={formatQuantity(plan.sent)} />
        <Kpi label={t("cReceived")} value={formatQuantity(plan.received)} />
        <Kpi label={t("cDiff")} value={formatQuantity(plan.diff)} danger={plan.diff > 0} />
      </div>
      <div className="sticky bottom-0 z-10 -mx-6 mt-auto flex flex-wrap items-center gap-3 border-t border-border bg-surface px-6 py-3">
        <p className="min-w-0 flex-1 text-body text-text-secondary">
          {plan.diff > 0 ? tr("footDiff", { q: formatQuantity(plan.diff), d: formatQuantity(plan.damaged) }) : tr("footOk")}
        </p>
        <Button
          variant="secondary"
          icon={CheckCheck}
          onClick={() => setRows(Object.fromEntries(doc.lines.map((l) => [l.id, { ...rows[l.id], recv: String(l.qty), reason: null }])))}
        >
          {tr("allOk")}
        </Button>
        <Button icon={PackageCheck} onClick={submit}>
          {tr("confirm")}
        </Button>
      </div>
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={tr("dT", { n: doc.number })}
        primaryAction={{ label: tr("confirm"), loading: receive.isPending, onClick: post }}
      >
        <ul className="flex flex-col gap-2 text-body">
          {[...new Set(plan.lines.map((l) => l.toZoneId))].map((z) => {
            const q = plan.lines.filter((l) => l.toZoneId === z).reduce((a, l) => a + l.receivedQty - l.damagedQty, 0);
            return q > 0 ? (
              <li key={z} className="flex items-start gap-2">
                <Layers size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-text-secondary" />
                {tr("cIn", { w: `${toPlace} · ${zoneName(z)}`, q: formatQuantity(q) })}
              </li>
            ) : null;
          })}
          {plan.damaged > 0 ? (
            <li className="flex items-start gap-2">
              <ShieldAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-warning" />
              {tr("cQuar", { q: formatQuantity(plan.damaged) })}
            </li>
          ) : null}
          {shortage > 0 ? (
            <li className="flex items-start gap-2">
              <Truck size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0 text-danger" />
              {tr("cShort", { q: formatQuantity(shortage), w: fromPlace })}
            </li>
          ) : null}
        </ul>
      </Modal>
    </div>
  );
}

function ReasonChip({ on, label, onPick }: { on: boolean; label: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={on}
      onClick={onPick}
      className={cn(
        "h-9 rounded-control border px-3 text-caption font-medium transition-colors",
        on ? "border-warning bg-warning-bg text-warning" : "border-border bg-surface text-text-primary hover:bg-background",
      )}
    >
      {label}
    </button>
  );
}

function Kpi({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <section className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface p-4">
      <p className="text-caption text-text-secondary">{label}</p>
      <p className={cn("text-[22px] leading-7 font-semibold tabular-nums", danger && "text-danger")}>{value}</p>
    </section>
  );
}
