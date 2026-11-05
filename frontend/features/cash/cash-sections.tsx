"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, CircleX, Hourglass, ArrowLeftRight, Printer, ReceiptText, LockKeyhole, ScrollText } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  DOC_TITLE,
  OP_STATUS,
  useCashOps,
  useDayCloses,
  useStatement,
  useTransfers,
  type CashOp,
  type CashOpStatus,
  type DayClose,
  type Move,
  type Transfer,
} from "./api";
import { ReasonDialog, refreshMoney } from "./op-dialogs";

export function OpStatusBadge({ status }: { status: CashOpStatus }) {
  const map = {
    PENDING: { tone: "warning", icon: Hourglass },
    POSTED: { tone: "success", icon: CircleCheck },
    REJECTED: { tone: "danger", icon: CircleX },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {OP_STATUS[status]}
    </Badge>
  );
}

const money = (v: string) => <span className="tabular-nums">{formatMoney(v)}</span>;

// ===== Tasdiqlashni kutayotganlar =====

export function PendingOps(props: { branchId: number }) {
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
      toast({ tone: "success", title: "Chiqim tasdiqlandi", description: `${o.number} · ${formatMoney(o.amount)} soʻm` });
    } catch (e) {
      toast({ tone: "danger", title: "Tasdiqlanmadi", description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="mb-6">
      <h2 className="mb-3 flex items-center gap-2 text-subtitle">
        <Hourglass size={18} strokeWidth={1.5} aria-hidden /> Tasdiqlashni kutmoqda
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
              <span className="font-mono tabular-nums">{formatMoney(o.amount)} soʻm</span>
              {mayApprove ? (
                <>
                  <Button variant="tertiary" icon={CircleX} onClick={() => setRejecting(o)}>
                    Rad etish
                  </Button>
                  <Button variant="secondary" icon={CircleCheck} loading={busy === o.id} onClick={() => void approve(o)}>
                    Tasdiqlash
                  </Button>
                </>
              ) : (
                <Badge tone="warning" icon={Hourglass}>
                  Filial rahbarida
                </Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
      {rejecting ? (
        <ReasonDialog
          title={`Rad etish: ${rejecting.number}`}
          action="Rad etish"
          onClose={() => setRejecting(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/cash-ops/{id}/reject", { params: { path: { id: rejecting.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: "Chiqim rad etildi", description: rejecting.number });
          }}
        />
      ) : null}
    </Card>
  );
}

// ===== Ko'chirma =====

export function StatementTab(props: { accountId: number | null }) {
  const today = formatIsoDate(todayTashkent());
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const isoFrom = parseUzDate(from);
  const isoTo = parseUzDate(to);
  const valid = isoFrom !== null && isoTo !== null;
  const st = useStatement(valid ? props.accountId : null, isoFrom ?? null, isoTo ?? null);

  const columns: TableColumn<Move>[] = [
    { key: "occurredAt", title: "Vaqt", render: (m) => formatDateTime(new Date(m.occurredAt)) },
    { key: "docNumber", title: "Hujjat", mono: true, render: (m) => <span title={DOC_TITLE[m.docType] ?? m.docType}>{m.docNumber}</span> },
    { key: "note", title: "Izoh", render: (m) => m.note ?? "" },
    { key: "employee", title: "Xodim", render: (m) => m.employee ?? "" },
    { key: "in", title: "Kirim", align: "right", render: (m) => (m.amount.startsWith("-") ? "" : money(m.amount)) },
    { key: "out", title: "Chiqim", align: "right", render: (m) => (m.amount.startsWith("-") ? money(m.amount.slice(1)) : "") },
  ];

  if (props.accountId == null) {
    return (
      <EmptyState
        icon={ScrollText}
        title="Hisobni tanlang"
        description="Yuqoridagi kartalardan birini bosing — koʻchirma shu hisob boʻyicha chiqadi."
      />
    );
  }
  return (
    <>
      <div className="mb-4 flex flex-wrap items-end gap-4">
        <div className="w-40">
          <TextField
            label="Dan"
            value={from}
            onChange={setFrom}
            placeholder="04.10.2026"
            size="sm"
            error={isoFrom === null ? "Sana notoʻgʻri" : undefined}
          />
        </div>
        <div className="w-40">
          <TextField
            label="Gacha"
            value={to}
            onChange={setTo}
            placeholder="04.10.2026"
            size="sm"
            error={isoTo === null ? "Sana notoʻgʻri" : undefined}
          />
        </div>
        {st.data ? (
          <dl className="flex flex-wrap gap-6">
            <Sum label="Davr boshi" value={st.data.opening} />
            <Sum label="Kirim" value={st.data.income} />
            <Sum label="Chiqim" value={st.data.expense} />
            <Sum label="Davr oxiri" value={st.data.closing} />
          </dl>
        ) : null}
      </div>
      {st.data?.closedThrough ? (
        <p className="mb-2 text-caption text-text-secondary">
          <LockKeyhole size={14} strokeWidth={1.5} className="mr-1 inline" aria-hidden />
          {formatIsoDate(st.data.closedThrough)} gacha kun yopilgan — bu kunlarga yangi hujjat kiritilmaydi.
        </p>
      ) : null}
      {st.error ? (
        <ErrorState onRetry={() => st.refetch()} />
      ) : (
        <Table
          caption={`Koʻchirma: ${st.data?.account ?? ""}`}
          density="compact"
          columns={columns}
          rows={st.data?.moves ?? []}
          rowKey={(m) => String(m.id)}
          loading={st.isPending}
          emptyState={
            <EmptyState icon={ScrollText} title="Bu davrda harakat yoʻq" description="Davrni oʻzgartiring yoki kirim/chiqim yozing." />
          }
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

export function OpsTab(props: { branchId: number }) {
  const me = useMe();
  const qc = useQueryClient();
  const list = useCashOps(props.branchId, null);
  const [cancelling, setCancelling] = useState<CashOp | null>(null);
  const mayCancel = can(me.data, CASH_CANCEL);
  const columns: TableColumn<CashOp>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "opDate", title: "Sana", render: (o) => formatIsoDate(o.opDate) },
    { key: "account", title: "Hisob" },
    { key: "item", title: "Modda", render: (o) => (o.source === "CLOSE" ? `${o.item} (kunni yopish)` : o.item) },
    { key: "party", title: "Kimdan / kimga", render: (o) => o.party ?? "" },
    { key: "in", title: "Kirim", align: "right", render: (o) => (o.direction === "IN" ? money(o.amount) : "") },
    { key: "out", title: "Chiqim", align: "right", render: (o) => (o.direction === "OUT" ? money(o.amount) : "") },
    { key: "status", title: "Holat", render: (o) => <OpStatusBadge status={o.status} /> },
  ];
  return (
    <>
      {list.error ? (
        <ErrorState onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption="Kassa va bank operatsiyalari"
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
                Chop etish
              </Button>
              {mayCancel && o.status === "POSTED" && o.source === "MANUAL" ? (
                <Button variant="tertiary" size="sm" icon={Ban} onClick={() => setCancelling(o)}>
                  Bekor qilish
                </Button>
              ) : null}
            </>
          )}
          emptyState={
            <EmptyState
              icon={ReceiptText}
              title="Hali operatsiya yoʻq"
              description="Xarajat va boshqa kirimlar «Kirim / chiqim» tugmasi bilan yoziladi."
            />
          }
        />
      )}
      {cancelling ? (
        <ReasonDialog
          title={`Bekor qilish: ${cancelling.number}`}
          action="Bekor qilish"
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/cash-ops/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: "Operatsiya bekor qilindi", description: cancelling.number });
          }}
        />
      ) : null}
    </>
  );
}

// ===== IO =====

export function TransfersTab(props: { branchId: number }) {
  const me = useMe();
  const qc = useQueryClient();
  const list = useTransfers(props.branchId);
  const [cancelling, setCancelling] = useState<Transfer | null>(null);
  const mayCancel = can(me.data, CASH_CANCEL);
  const columns: TableColumn<Transfer>[] = [
    { key: "number", title: "Raqam", mono: true },
    { key: "transferDate", title: "Sana", render: (t) => formatIsoDate(t.transferDate) },
    { key: "fromAccount", title: "Qayerdan" },
    { key: "toAccount", title: "Qayerga" },
    { key: "amount", title: "Summa", align: "right", render: (t) => money(t.amount) },
    {
      key: "status",
      title: "Holat",
      render: (t) =>
        t.status === "POSTED" ? (
          <Badge tone="success" icon={CircleCheck}>
            Oʻtkazilgan
          </Badge>
        ) : (
          <Badge tone="neutral" icon={Ban}>
            Bekor qilingan
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
          caption="Hisoblar orasida oʻtkazmalar"
          columns={columns}
          rows={list.data ?? []}
          rowKey={(t) => String(t.id)}
          loading={list.isPending}
          rowActions={(t) =>
            mayCancel && t.status === "POSTED" ? (
              <Button variant="tertiary" size="sm" icon={Ban} onClick={() => setCancelling(t)}>
                Bekor qilish
              </Button>
            ) : null
          }
          emptyState={
            <EmptyState
              icon={ArrowLeftRight}
              title="Hali oʻtkazma yoʻq"
              description="Masalan, Terminal yoki kassadagi pulni bankka oʻtkazish — «Oʻtkazma» tugmasi."
            />
          }
        />
      )}
      {cancelling ? (
        <ReasonDialog
          title={`Bekor qilish: ${cancelling.number}`}
          action="Bekor qilish"
          onClose={() => setCancelling(null)}
          onSubmit={async (reason) => {
            await ensureCsrf();
            await unwrap(api.POST("/api/money-transfers/{id}/cancel", { params: { path: { id: cancelling.id } }, body: { reason } }));
            await refreshMoney(qc);
            toast({ tone: "success", title: "Oʻtkazma bekor qilindi", description: cancelling.number });
          }}
        />
      ) : null}
    </>
  );
}

// ===== Yopilgan kunlar =====

export function ClosesTab(props: { branchId: number }) {
  const list = useDayCloses(props.branchId, true);
  const columns: TableColumn<DayClose>[] = [
    { key: "closeDate", title: "Kun", render: (c) => formatIsoDate(c.closeDate) },
    { key: "account", title: "Kassa" },
    { key: "expected", title: "Kutilgan", align: "right", render: (c) => money(c.expected) },
    { key: "counted", title: "Sanaldi", align: "right", render: (c) => money(c.counted) },
    {
      key: "diff",
      title: "Farq",
      align: "right",
      render: (c) => (c.diff === "0.00" ? money(c.diff) : <span className="text-danger">{money(c.diff)}</span>),
    },
    { key: "correctionNumber", title: "Tuzatish", mono: true, render: (c) => c.correctionNumber ?? "" },
    { key: "note", title: "Izoh", render: (c) => c.note ?? "" },
    { key: "closedBy", title: "Kim yopdi", render: (c) => `${c.closedBy} · ${formatDateTime(new Date(c.closedAt))}` },
  ];
  return list.error ? (
    <ErrorState onRetry={() => list.refetch()} />
  ) : (
    <Table
      caption="Yopilgan kunlar"
      columns={columns}
      rows={list.data ?? []}
      rowKey={(c) => String(c.id)}
      loading={list.isPending}
      emptyState={
        <EmptyState
          icon={LockKeyhole}
          title="Hali kun yopilmagan"
          description="Kun oxirida kassadagi pulni sanab «Kunni yopish» ni bosing."
        />
      }
    />
  );
}
