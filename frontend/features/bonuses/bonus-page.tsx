"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlarmClock, CalendarClock, Check, CircleCheck, ClockAlert, FileText, Gift, Hourglass, PackagePlus, Wallet, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { DateChip, MultiFilter } from "@/components/ui/multi-filter";
import { RowMenu } from "@/components/ui/row-menu";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { KpiCard, PayablesHeader } from "@/features/debts/payables";
import { sumOf } from "@/features/debts/receivables-model";
import { RECEIPT_CREATE, useConfirmBonus, useDeclineBonus } from "@/features/receipts/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { cn } from "@/lib/cn";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { BONUS_TABS, fitsBonus, inBonusTab, isLate, isSoon, isWaiting, type BonusTab } from "./bonus-model";

export type BonusRow = components["schemas"]["BonusRow"];
type BonusMove = components["schemas"]["BonusMove"];
type PendingBonus = components["schemas"]["PendingBonus"];

/** Bonus shu kundan koʻp ishlatilmasa — eslatma (SPEC 5.1; backend BonusBalances.IDLE_DAYS). */
export const IDLE_DAYS = 30;
export const BONUS_VIEW = ["sdebt.view", "supplierBonus.confirm"] as const;

export const isIdle = (r: Pick<BonusRow, "idleDays">) => r.idleDays != null && r.idleDays >= IDLE_DAYS;

const money = (v: string) =>
  v === "0.00" ? <span className="text-text-secondary">—</span> : <span className="tabular-nums">{formatMoney(v)}</span>;

const DOC_TYPES = ["BNS", "KR"] as const;
const isDocType = (v: string): v is (typeof DOC_TYPES)[number] => (DOC_TYPES as readonly string[]).includes(v);

type BonusReceiptRow = components["schemas"]["BonusReceiptRow"];
type BonusBalanceRow = components["schemas"]["BonusBalanceRow"];

/**
 * YB qarzi → Bonus balans (prototip Payables, SPEC 5.1): YB chegirmasi qarzdan ayrilmaydi — «Bonus tasdiqlandi» (BNS) bilan balansga
 * tushadi, «Bonus berilmadi» — sabab bilan yopiladi. 4 karta, koʻrinishlar, filtrlar, kirimlar jadvali va YB boʻyicha balanslar.
 */
export function BonusPage() {
  const t = useTranslations("bonuses");
  const tp = useTranslations("debts.pay");
  const me = useMe();
  const router = useRouter();
  const qc = useQueryClient();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = BONUS_VIEW.some((k) => can(me.data, k));
  const canDecide = can(me.data, "supplierBonus.confirm");
  const canUse = can(me.data, RECEIPT_CREATE);
  const branchId = me.data?.allBranches ? (selectedBranch ?? undefined) : undefined;
  const allBranches = !!me.data?.allBranches && selectedBranch == null;
  const report = useQuery({
    queryKey: ["supplier-bonuses", "receipts", branchId ?? null],
    queryFn: () => unwrap(api.GET("/api/supplier-bonuses/receipts", { params: { query: { branchId } } })),
    enabled: allowed && !!me.data,
  });
  const confirm = useConfirmBonus();
  const decline = useDeclineBonus();
  const [tab, setTab] = useState<BonusTab>("all");
  const [q, setQ] = useState("");
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [branches, setBranches] = useState<string[]>([]);
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({ from: null, to: null });
  const [dialog, setDialog] = useState<{ kind: "ok" | "no"; row: BonusReceiptRow } | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const [open, setOpen] = useState<BonusBalanceRow | null>(null);

  const all = useMemo(() => report.data?.rows ?? [], [report.data]);
  const fitting = useMemo(
    () => all.filter((r) => fitsBonus(r, { q, suppliers, branches, from: range.from, to: range.to })),
    [all, q, suppliers, branches, range],
  );
  const rows = fitting.filter((r) => inBonusTab(r, tab));
  const balances = (report.data?.balances ?? []).filter(
    (b) =>
      (suppliers.length === 0 || suppliers.includes(String(b.supplierId))) &&
      (branches.length === 0 || branches.includes(String(b.branchId))),
  );
  const filtered = q.trim() !== "" || suppliers.length > 0 || branches.length > 0 || range.from != null || range.to != null;
  const clear = () => {
    setQ("");
    setSuppliers([]);
    setBranches([]);
    setRange({ from: null, to: null });
  };

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;

  const wait = all.filter(isWaiting);
  const soon = all.filter(isSoon);
  const late = all.filter(isLate);
  const withBalance = (report.data?.balances ?? []).filter((b) => !b.balance.startsWith("-") && b.balance !== "0.00");
  const options = <K extends "supplierId" | "branchId">(key: K, label: (r: BonusReceiptRow) => string) =>
    [...new Map(all.map((r) => [String(r[key]), label(r)])).entries()]
      .map(([value, text]) => ({ value, label: text, count: all.filter((r) => String(r[key]) === value).length }))
      .sort((a, b) => a.label.localeCompare(b.label));

  const refresh = () => qc.invalidateQueries({ queryKey: ["supplier-bonuses"] });
  const run = (row: BonusReceiptRow, kind: "ok" | "no") => {
    setReason("");
    setReasonError(null);
    confirm.reset();
    decline.reset();
    setDialog({ kind, row });
  };
  const submit = async () => {
    if (!dialog) return;
    if (dialog.kind === "ok") {
      const d = await confirm.mutateAsync(dialog.row.receiptId).catch(() => null);
      if (!d) return;
      toast({ tone: "success", title: t("tOk", { n: d.bonusNumber ?? "" }) });
    } else {
      if (reason.trim() === "") {
        setReasonError(t("reasonRequired"));
        return;
      }
      const d = await decline.mutateAsync({ id: dialog.row.receiptId, reason: reason.trim() }).catch(() => null);
      if (!d) return;
      toast({ tone: "success", title: t("tNo") });
    }
    setDialog(null);
    await refresh();
  };
  const dialogError = describeError(dialog?.kind === "ok" ? confirm.error : decline.error).message;
  const balanceOf = (row: BonusReceiptRow) =>
    report.data?.balances.find((b) => b.supplierId === row.supplierId && b.branchId === row.branchId)?.balance ?? "0.00";

  const columns: TableColumn<BonusReceiptRow>[] = [
    { key: "supplier", title: tp("col.supplier"), wrap: true, render: (r) => <span className="font-medium">{r.supplier}</span> },
    ...(allBranches
      ? [
          {
            key: "branch",
            title: tp("col.branch"),
            render: (r: BonusReceiptRow) => <span className="text-text-secondary">{r.branch}</span>,
          },
        ]
      : []),
    { key: "receiptNumber", title: t("col.receipt"), mono: true },
    {
      key: "receiptSum",
      title: t("col.receiptSum"),
      align: "right",
      render: (r) => <span className="tabular-nums">{formatMoney(r.receiptSum)}</span>,
    },
    {
      key: "amount",
      title: t("col.bonusPct"),
      align: "right",
      render: (r) => (
        <div className="flex flex-col items-end">
          <span className="font-semibold tabular-nums">{formatMoney(r.amount)}</span>
          {r.percent ? <span className="text-caption text-text-secondary">{`${r.percent.replace(".", ",")}%`}</span> : null}
        </div>
      ),
    },
    {
      key: "bonusDate",
      title: t("col.bonusDate"),
      render: (r) => (
        <span className={cn("tabular-nums", isLate(r) && "font-semibold text-danger", isSoon(r) && "font-semibold text-warning")}>
          {r.bonusDate ? formatIsoDate(r.bonusDate) : "—"}
        </span>
      ),
    },
    { key: "state", title: tp("col.status"), wrap: true, render: (r) => <BonusStatus r={r} /> },
  ];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PayablesHeader count={report.data ? all.length : null} today={report.data?.today ?? null} />
      {report.data ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <KpiCard
            icon={Gift}
            iconClass="bg-success-bg text-success"
            label={t("kBalance")}
            value={sumOf(report.data.balances, (b) => b.balance)}
            note={t("nSuppliers", { n: withBalance.length })}
            active={tab === "ok"}
            onClick={() => setTab("ok")}
          />
          <KpiCard
            icon={Hourglass}
            iconClass="bg-warning-bg text-warning"
            label={t("kPending")}
            value={sumOf(wait, (r) => r.amount)}
            note={tp("nDocs", { n: wait.length })}
            active={tab === "wait"}
            onClick={() => setTab("wait")}
          />
          <KpiCard
            icon={CalendarClock}
            iconClass="bg-warning-bg text-warning"
            label={t("kSoon")}
            value={sumOf(soon, (r) => r.amount)}
            note={tp("nDocs", { n: soon.length })}
            active={tab === "soon"}
            onClick={() => setTab("soon")}
          />
          <KpiCard
            icon={ClockAlert}
            iconClass="bg-danger-bg text-danger"
            label={t("kLate")}
            value={sumOf(late, (r) => r.amount)}
            note={tp("nDocs", { n: late.length })}
            valueClass="text-danger"
            highlight={late.length > 0}
            active={tab === "late"}
            onClick={() => setTab("late")}
          />
        </div>
      ) : null}
      <Tabs
        aria-label={t("tabsLabel")}
        value={tab}
        onChange={(k) => setTab(k as BonusTab)}
        items={BONUS_TABS.map((k) => ({ key: k, label: t(`tab.${k}`), count: fitting.filter((r) => inBonusTab(r, k)).length }))}
      />
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={t("tableCaption")}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.receiptId)}
          loading={allowed && report.isPending}
          onRowClick={(r) => (isWaiting(r) && canDecide ? run(r, "ok") : router.push(`/receipts/${r.receiptId}`))}
          rowActions={(r) => (
            <RowMenu
              label={t("actions")}
              items={[
                ...(isWaiting(r) && canDecide
                  ? [
                      {
                        key: "ok",
                        label: t("confirm"),
                        icon: <Check size={16} strokeWidth={1.5} aria-hidden />,
                        onSelect: () => run(r, "ok"),
                      },
                      { key: "no", label: t("decline"), icon: <X size={16} strokeWidth={1.5} aria-hidden />, onSelect: () => run(r, "no") },
                    ]
                  : []),
                {
                  key: "open",
                  label: tp("openRc"),
                  icon: <FileText size={16} strokeWidth={1.5} aria-hidden />,
                  onSelect: () => router.push(`/receipts/${r.receiptId}`),
                },
              ]}
            />
          )}
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={q}
                  onChange={setQ}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              <MultiFilter
                label={tp("col.supplier")}
                options={options("supplierId", (r) => r.supplier)}
                selected={suppliers}
                onChange={setSuppliers}
                searchable
              />
              {allBranches ? (
                <MultiFilter
                  label={tp("col.branch")}
                  options={options("branchId", (r) => r.branch)}
                  selected={branches}
                  onChange={setBranches}
                />
              ) : null}
              <DateChip
                label={t("col.bonusDate")}
                from={range.from}
                to={range.to}
                invalid={t("dateInvalid")}
                onChange={(from, to) => setRange({ from, to })}
              />
              {filtered ? (
                <Button variant="tertiary" size="sm" onClick={clear}>
                  {tp("clearFilters")}
                </Button>
              ) : null}
            </div>
          }
          emptyState={
            filtered || tab !== "all" ? (
              <NoResultsState
                onClearFilters={() => {
                  clear();
                  setTab("all");
                }}
              />
            ) : (
              <EmptyState icon={Gift} title={t("empty.title")} description={t("empty.description")} />
            )
          }
        />
      )}
      {report.data ? (
        <section className="min-w-0 rounded-card border border-border bg-surface">
          <h2 className="border-b border-border px-4 py-3.5 text-body font-semibold">{t("balTitle")}</h2>
          {balances.length === 0 ? (
            <p className="px-4 py-5 text-table text-text-secondary">{t("balEmpty")}</p>
          ) : (
            <ul>
              {balances.map((b) => {
                const positive = b.balance !== "0.00" && !b.balance.startsWith("-");
                const sub = [
                  allBranches ? b.branch : null,
                  b.idle ? t("idle", { days: IDLE_DAYS }) : b.pendingCount > 0 ? t("pendingN", { n: b.pendingCount }) : null,
                ]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <li
                    key={`${b.branchId}-${b.supplierId}`}
                    className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-border px-4 py-3 last:border-b-0"
                  >
                    <button type="button" onClick={() => setOpen(b)} className="flex min-w-[200px] flex-1 flex-col text-left">
                      <span className="font-medium hover:underline">{b.supplier}</span>
                      {sub ? <span className="text-caption text-text-secondary">{sub}</span> : null}
                    </button>
                    <span className="flex min-w-[140px] flex-col items-end">
                      <span className="text-caption text-text-secondary">{t("balance")}</span>
                      <span className={cn("font-semibold tabular-nums", positive ? "text-success" : "text-text-secondary")}>
                        {formatMoney(b.balance)}
                      </span>
                    </span>
                    <span className="flex min-w-[140px] flex-col items-end">
                      <span className="text-caption text-text-secondary">{t("pending")}</span>
                      <span className="font-medium tabular-nums">{b.pending === "0.00" ? "—" : formatMoney(b.pending)}</span>
                    </span>
                    {positive && canUse ? (
                      <Button
                        variant="secondary"
                        size="sm"
                        icon={PackagePlus}
                        onClick={() =>
                          router.push(`/receipts/new?bonusSupplier=${b.supplierId}&supplierName=${encodeURIComponent(b.supplier)}`)
                        }
                      >
                        {t("useBonus")}
                      </Button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}
      {dialog ? (
        <Modal
          open
          onClose={() => setDialog(null)}
          size="sm"
          tone={dialog.kind === "no" ? "danger" : "default"}
          title={dialog.kind === "ok" ? t("confirmTitle") : t("declineTitle")}
          primaryAction={{
            label: dialog.kind === "ok" ? t("confirm") : t("decline"),
            onClick: () => void submit(),
            loading: confirm.isPending || decline.isPending,
          }}
        >
          <div className="flex flex-col gap-3">
            <p className="text-text-secondary">{`${dialog.row.supplier} · ${dialog.row.receiptNumber}`}</p>
            {dialog.kind === "ok" ? (
              <ul className="flex flex-col gap-2">
                <li className="flex items-center gap-2">
                  <Gift size={16} strokeWidth={1.5} aria-hidden className="text-success" />
                  {t("balChange", {
                    a: formatMoney(balanceOf(dialog.row)),
                    b: formatMoney(sumOf([balanceOf(dialog.row), dialog.row.amount], (v) => v)),
                    s: formatMoney(dialog.row.amount),
                  })}
                </li>
                <li className="flex items-center gap-2">
                  <Wallet size={16} strokeWidth={1.5} aria-hidden className="text-text-secondary" />
                  {t("noDebt")}
                </li>
              </ul>
            ) : (
              <>
                <p>{t("declineText")}</p>
                <TextField
                  label={t("reason")}
                  value={reason}
                  onChange={(v) => {
                    setReason(v);
                    setReasonError(null);
                  }}
                  error={reasonError ?? undefined}
                  required
                  maxLength={300}
                />
              </>
            )}
            {dialogError ? <Alert tone="danger" title={dialogError} /> : null}
          </div>
        </Modal>
      ) : null}
      {open ? <BonusDrawer row={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function BonusStatus({ r }: { r: BonusReceiptRow }) {
  const t = useTranslations("bonuses");
  if (r.state === "CONFIRMED")
    return (
      <Badge tone="success" icon={CircleCheck}>
        {`${t("tab.ok")} · ${r.bnsNumber ?? ""}`}
      </Badge>
    );
  if (r.state === "DECLINED")
    return (
      <Badge tone="neutral" icon={X}>
        {r.declineReason ? `${t("tab.no")} · ${r.declineReason}` : t("tab.no")}
      </Badge>
    );
  return (
    <Badge tone={isLate(r) ? "danger" : "warning"} icon={Hourglass}>
      {t("tab.wait")}
    </Badge>
  );
}

function BonusDrawer(props: { row: BonusBalanceRow; onClose: () => void }) {
  const t = useTranslations("bonuses");
  const detail = useQuery({
    queryKey: ["supplier-bonuses", props.row.branchId, props.row.supplierId],
    queryFn: () =>
      unwrap(
        api.GET("/api/supplier-bonuses/{supplierId}", {
          params: { path: { supplierId: props.row.supplierId }, query: { branchId: props.row.branchId } },
        }),
      ),
  });
  const moveColumns: TableColumn<BonusMove>[] = [
    { key: "at", title: t("col.date"), render: (m) => formatDateTime(new Date(m.at)) },
    {
      key: "docNumber",
      title: t("col.document"),
      render: (m) => (
        <div>
          <div className="font-mono">{m.docNumber}</div>
          <div className="text-caption text-text-secondary">{isDocType(m.docType) ? t(`docType.${m.docType}`) : m.docType}</div>
        </div>
      ),
    },
    {
      key: "amount",
      title: t("col.amount"),
      align: "right",
      render: (m) => <span className={`tabular-nums ${m.amount.startsWith("-") ? "" : "text-success"}`}>{formatMoney(m.amount)}</span>,
    },
    { key: "balance", title: t("col.balance"), align: "right", render: (m) => money(m.balance) },
    { key: "employee", title: t("col.employee"), render: (m) => m.employee ?? "" },
  ];
  const pendingColumns: TableColumn<PendingBonus>[] = [
    { key: "receiptNumber", title: t("col.receipt"), mono: true },
    { key: "receiptDate", title: t("col.receiptDate"), render: (p) => formatIsoDate(p.receiptDate) },
    {
      key: "bonusDate",
      title: t("col.bonusDate"),
      render: (p) =>
        p.overdue ? (
          <Badge tone="warning" icon={AlarmClock}>
            {formatIsoDate(p.bonusDate)} — {t("overdue")}
          </Badge>
        ) : (
          formatIsoDate(p.bonusDate)
        ),
    },
    { key: "amount", title: t("col.bonus"), align: "right", render: (p) => money(p.amount) },
  ];
  return (
    <Drawer open onClose={props.onClose} size="lg" kind={t("col.supplier")} title={props.row.supplier} subtitle={props.row.branch}>
      {detail.error ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-caption text-text-secondary">{t("balance")}</dt>
              <dd className="font-mono tabular-nums">
                {formatMoney(detail.data?.balance ?? props.row.balance)} {t("currency")}
              </dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">{t("pending")}</dt>
              <dd className="font-mono tabular-nums">
                {formatMoney(props.row.pending)} {t("currency")}
              </dd>
            </div>
          </dl>
          <section>
            <h2 className="mb-2 text-subtitle">{t("pendingBonuses")}</h2>
            <p className="mb-3 text-caption text-text-secondary">{t("pendingHint")}</p>
            <Table
              caption={t("pendingBonuses")}
              density="compact"
              columns={pendingColumns}
              rows={detail.data?.pending ?? []}
              rowKey={(p) => String(p.receiptId)}
              loading={detail.isPending}
              emptyState={<EmptyState icon={Gift} title={t("pendingEmpty.title")} description={t("pendingEmpty.description")} />}
            />
          </section>
          <section>
            <h2 className="mb-2 text-subtitle">{t("moves")}</h2>
            <Table
              caption={t("movesCaption")}
              density="compact"
              columns={moveColumns}
              rows={detail.data?.moves ?? []}
              rowKey={(m) => `${m.docType}:${m.docId}:${m.at}:${m.amount}`}
              loading={detail.isPending}
              emptyState={<EmptyState icon={Gift} title={t("movesEmpty.title")} description={t("movesEmpty.description")} />}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}
