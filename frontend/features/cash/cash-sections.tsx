"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Ban, CircleCheck, CircleX, Hourglass, ArrowLeftRight, Printer, ReceiptText, LockKeyhole, ScrollText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FilterChip } from "@/components/ui/filter-chip";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import {
  CASH_APPROVE,
  CASH_CANCEL,
  isDocTitleKey,
  useCashOps,
  useDayCloses,
  useStatement,
  useTransfers,
  type CashOp,
  type CashOpStatus,
  type DayClose,
  type Move,
  type Transfer,
  type OpsFilter,
} from "./api";
import { ReasonDialog, refreshMoney } from "./op-dialogs";

export function OpStatusBadge({ status }: { status: CashOpStatus }) {
  const tc = useTranslations("cash");
  const map = {
    PENDING: { tone: "warning", icon: Hourglass },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "danger", icon: CircleX },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {tc(`opStatus.${status}`)}
    </Badge>
  );
}

const money = (v: string) => <span className="tabular-nums">{formatMoney(v)}</span>;

// ===== Tasdiqlashni kutayotganlar =====

export function PendingOps(props: { branchId: number }) {
  const tc = useTranslations("cash");
  const me = useMe();
  const qc = useQueryClient();
  const list = useCashOps(props.branchId, "PENDING");
  const [busy, setBusy] = useState<number | null>(null);
  const [rejecting, setRejecting] = useState<CashOp | null>(null);
  const mayApprove = can(me.data, CASH_APPROVE);
  const rows = list.data ?? [];
  if (rows.length === 0) return null;

  async function approve(o: CashOp) {
    setBusy(o.id);
    try {
      await ensureCsrf();
      await unwrap(api.POST("/api/cash-ops/{id}/approve", { params: { path: { id: o.id } } }));
      await refreshMoney(qc);
      toast({
        tone: "success",
        title: tc("pending.approved"),
        description: tc("amountLine", { number: o.number, amount: formatMoney(o.amount) }),
      });
    } catch (e) {
      toast({ tone: "danger", title: tc("pending.approveFailed"), description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-subtitle">
        <Hourglass size={18} strokeWidth={1.5} aria-hidden /> {tc("pending.title")}
      </h2>
      <ul className="flex flex-col">
        {rows.map((o) => (
          <li key={o.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
            <div className="min-w-0">
              <div>
                <span className="font-mono">{o.number}</span> · {o.item}
                {o.party ? ` · ${o.party}` : ""}
              </div>
              <div className="text-caption text-text-secondary">
                {o.account} · {o.createdBy} · {formatDateTime(new Date(o.createdAt))}
                {o.note ? ` · ${o.note}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-mono tabular-nums">
                {formatMoney(o.amount)} {tc("currency")}
              </span>
              {mayApprove ? (
                <>
                  <Button variant="tertiary" icon={CircleX} onClick={() => setRejecting(o)}>
                    {tc("pending.reject")}
                  </Button>
                  <Button variant="secondary" icon={CircleCheck} loading={busy === o.id} onClick={() => void approve(o)}>
                    {tc("pending.approve")}
                  </Button>
                </>
              ) : (
                <Badge tone="warning" icon={Hourglass}>
                  {tc("pending.atManager")}
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rejecting ? (
        <ReasonDialog
          title={tc("pending.rejectTitle", { number: rejecting.number })}
          action={tc("pending.reject")}
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/cash-ops/{id}/reject", { params: { path: { id: rejecting.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: tc("pending.rejected"), description: rejecting.number });
          }}
        />
      ) : null}
    </Card>
  );
}

// ===== Ko'chirma =====

export function StatementTab(props: { accountId: number | null }) {
  const tc = useTranslations("cash");
  const today = formatIsoDate(todayTashkent());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const isoFrom = parseUzDate(from);
  const isoTo = parseUzDate(to);
  const valid = isoFrom !== null && isoTo !== null;
  const st = useStatement(valid ? props.accountId : null, isoFrom ?? null, isoTo ?? null);

  const columns: TableColumn<Move>[] = [
    { key: "occurredAt", title: tc("col.time"), render: (m) => formatDateTime(new Date(m.occurredAt)) },
    {
      key: "docNumber",
      title: tc("col.document"),
      mono: true,
      render: (m) => <span title={isDocTitleKey(m.docType) ? tc(`docType.${m.docType}`) : m.docType}>{m.docNumber}</span>,
    },
    { key: "note", title: tc("col.note"), render: (m) => m.note ?? "" },
    { key: "employee", title: tc("col.employee"), render: (m) => m.employee ?? "" },
    { key: "in", title: tc("col.in"), align: "right", render: (m) => (m.amount.startsWith("-") ? "" : money(m.amount)) },
    { key: "out", title: tc("col.out"), align: "right", render: (m) => (m.amount.startsWith("-") ? money(m.amount.slice(1)) : "") },
  ];

  if (props.accountId == null) {
    return <EmptyState icon={ScrollText} title={tc("statement.noAccount.title")} description={tc("statement.noAccount.description")} />;
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-40">
          <TextField
            variant="date"
            label={tc("from")}
            value={from}
            onChange={setFrom}
            placeholder="04.10.2026"
            size="sm"
            error={isoFrom === null ? tc("badDate") : undefined}
          />
        </div>
        <div className="w-40">
          <TextField
            variant="date"
            label={tc("to")}
            value={to}
            onChange={setTo}
            placeholder="04.10.2026"
            size="sm"
            error={isoTo === null ? tc("badDate") : undefined}
          />
        </div>
        {st.data ? (
          <dl className="flex flex-wrap gap-6">
            <Sum label={tc("statement.opening")} value={st.data.opening} />
            <Sum label={tc("col.in")} value={st.data.income} />
            <Sum label={tc("col.out")} value={st.data.expense} />
            <Sum label={tc("statement.closing")} value={st.data.closing} />
          </dl>
        ) : null}
      </div>
      {st.data?.closedThrough ? (
        <p className="mb-2 text-caption text-text-secondary">
          <LockKeyhole size={14} strokeWidth={1.5} className="mr-1 inline" aria-hidden />
          {tc("statement.closedThrough", { date: formatIsoDate(st.data.closedThrough) })}
        </p>
      ) : null}
      {st.error ? (
        <ErrorState onRetry={() => st.refetch()} />
      ) : (
        <Table
          caption={tc("statement.caption", { account: st.data?.account ?? "" })}
          density="compact"
          columns={columns}
          rows={st.data?.moves ?? []}
          rowKey={(m) => String(m.id)}
          loading={st.isPending}
          emptyState={<EmptyState icon={ScrollText} title={tc("statement.empty.title")} description={tc("statement.empty.description")} />}
        />
      )}
    </>
  );
}

function Sum(props: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-caption text-text-secondary">{props.label}</dt>
      <dd className="font-mono tabular-nums">{formatMoney(props.value)}</dd>
    </div>
  );
}

// ===== KO / BO =====

export function OpsTab(props: { branchId: number; filter?: OpsFilter | null; onClearFilter?: () => void }) {
  const tc = useTranslations("cash");
  const me = useMe();
  const qc = useQueryClient();
  const list = useCashOps(props.branchId, null, props.filter ?? null);
  const [cancelling, setCancelling] = useState<CashOp | null>(null);
  const mayCancel = can(me.data, CASH_CANCEL);
  const columns: TableColumn<CashOp>[] = [
    {
      key: "number",
      title: tc("col.number"),
      mono: true,
      render: (o) => (
        <Link href={`/cash/ops/${o.id}`} className="text-primary hover:underline">
          {o.number}
        </Link>
      ),
    },
    { key: "opDate", title: tc("col.date"), render: (o) => formatIsoDate(o.opDate) },
    { key: "account", title: tc("col.account") },
    { key: "item", title: tc("col.item"), render: (o) => (o.source === "CLOSE" ? tc("ops.closeItem", { item: o.item }) : o.item) },
    { key: "party", title: tc("col.party"), render: (o) => o.party ?? "" },
    { key: "in", title: tc("col.in"), align: "right", render: (o) => (o.direction === "IN" ? money(o.amount) : "") },
    { key: "out", title: tc("col.out"), align: "right", render: (o) => (o.direction === "OUT" ? money(o.amount) : "") },
    { key: "status", title: tc("col.status"), render: (o) => <OpStatusBadge status={o.status} /> },
  ];
  const f = props.filter;
  return (
    <>
      {f ? (
        <div className="mb-3">
          <FilterChip
            label={tc("ops.itemChip", {
              name: f.item,
              period: f.from && f.to ? (f.from === f.to ? formatIsoDate(f.from) : `${formatIsoDate(f.from)} – ${formatIsoDate(f.to)}`) : "",
            })}
            what={tc("ops.itemFilter")}
            onClear={() => props.onClearFilter?.()}
          />
        </div>
      ) : null}
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={tc("ops.caption")}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(o) => String(o.id)}
          loading={list.isPending}
          rowActions={(o) => (
            <>
              <Button
                variant="tertiary"
                size="sm"
                icon={Printer}
                onClick={() => window.open(`/api/cash-ops/${o.id}/pdf`, "_blank", "noopener")}
              >
                {tc("print")}
              </Button>
              {mayCancel && o.status === "POSTED" && o.source === "MANUAL" ? (
                <Button variant="tertiary" size="sm" icon={Ban} onClick={() => setCancelling(o)}>
                  {tc("cancel")}
                </Button>
              ) : null}
            </>
          )}
          emptyState={<EmptyState icon={ReceiptText} title={tc("ops.empty.title")} description={tc("ops.empty.description")} />}
        />
      )}
      {cancelling ? (
        <ReasonDialog
          title={tc("cancelTitle", { number: cancelling.number })}
          action={tc("cancel")}
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/cash-ops/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: tc("ops.cancelled"), description: cancelling.number });
          }}
        />
      ) : null}
    </>
  );
}

// ===== IO =====

export function TransfersTab(props: { branchId: number }) {
  const tc = useTranslations("cash");
  const me = useMe();
  const qc = useQueryClient();
  const list = useTransfers(props.branchId);
  const [cancelling, setCancelling] = useState<Transfer | null>(null);
  const mayCancel = can(me.data, CASH_CANCEL);
  const columns: TableColumn<Transfer>[] = [
    { key: "number", title: tc("col.number"), mono: true },
    { key: "transferDate", title: tc("col.date"), render: (t) => formatIsoDate(t.transferDate) },
    { key: "fromAccount", title: tc("col.fromAccount") },
    { key: "toAccount", title: tc("col.toAccount") },
    { key: "amount", title: tc("col.amount"), align: "right", render: (t) => money(t.amount) },
    {
      key: "status",
      title: tc("col.status"),
      render: (t) =>
        t.status === "POSTED" ? (
          <Badge tone="success" icon={CircleCheck}>
            {tc("opStatus.POSTED")}
          </Badge>
        ) : (
          <Badge tone="neutral" icon={Ban}>
            {tc("opStatus.CANCELLED")}
          </Badge>
        ),
    },
  ];
  return (
    <>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={tc("io.caption")}
          columns={columns}
          rows={list.data ?? []}
          rowKey={(t) => String(t.id)}
          loading={list.isPending}
          rowActions={(t) =>
            mayCancel && t.status === "POSTED" ? (
              <Button variant="tertiary" size="sm" icon={Ban} onClick={() => setCancelling(t)}>
                {tc("cancel")}
              </Button>
            ) : null
          }
          emptyState={<EmptyState icon={ArrowLeftRight} title={tc("io.empty.title")} description={tc("io.empty.description")} />}
        />
      )}
      {cancelling ? (
        <ReasonDialog
          title={tc("cancelTitle", { number: cancelling.number })}
          action={tc("cancel")}
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/money-transfers/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: tc("io.cancelled"), description: cancelling.number });
          }}
        />
      ) : null}
    </>
  );
}

// ===== Yopilgan kunlar =====

export function ClosesTab(props: { branchId: number }) {
  const tc = useTranslations("cash");
  const router = useRouter();
  const list = useDayCloses(props.branchId, true);
  const columns: TableColumn<DayClose>[] = [
    { key: "closeDate", title: tc("col.day"), render: (c) => formatIsoDate(c.closeDate) },
    { key: "account", title: tc("col.cash") },
    { key: "expected", title: tc("col.expected"), align: "right", render: (c) => money(c.expected) },
    { key: "counted", title: tc("col.counted"), align: "right", render: (c) => money(c.counted) },
    {
      key: "diff",
      title: tc("col.diff"),
      align: "right",
      render: (c) => (c.diff === "0.00" ? money(c.diff) : <span className="text-danger">{money(c.diff)}</span>),
    },
    { key: "correctionNumber", title: tc("col.correction"), mono: true, render: (c) => c.correctionNumber ?? "" },
    { key: "note", title: tc("col.note"), render: (c) => c.note ?? "" },
    { key: "closedBy", title: tc("col.closedBy"), render: (c) => `${c.closedBy} · ${formatDateTime(new Date(c.closedAt))}` },
  ];
  return list.error ? (
    <ErrorState onRetry={() => list.refetch()} />
  ) : (
    <Table
      caption={tc("closes.caption")}
      columns={columns}
      rows={list.data ?? []}
      rowKey={(c) => String(c.id)}
      onRowClick={(c) => router.push(`/cash/close?acct=${c.accountId}&date=${c.closeDate}`)}
      loading={list.isPending}
      emptyState={<EmptyState icon={LockKeyhole} title={tc("closes.empty.title")} description={tc("closes.empty.description")} />}
    />
  );
}
