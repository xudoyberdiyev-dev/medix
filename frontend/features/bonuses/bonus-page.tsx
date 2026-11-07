"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { AlarmClock, Gift } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Checkbox } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate } from "@/features/counterparties/api";
import { matchesDebt } from "@/features/debts/debts-page";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";

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

/**
 * Pul → Bonus balans (SPEC 5.1): YB chegirmasi qarzdan ayrilmaydi — «Bonus tasdiqlandi» (BNS) bilan balansga tushadi va keyingi
 * kirimlarda ishlatiladi. Balans faqat jurnaldan; kutilayotgan — chegirmali, lekin hali tasdiqlanmagan kirimlar.
 */
export function BonusPage() {
  const t = useTranslations("bonuses");
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const allowed = BONUS_VIEW.some((k) => can(me.data, k));
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const report = useQuery({
    queryKey: ["supplier-bonuses", branchId],
    queryFn: () => unwrap(api.GET("/api/supplier-bonuses", { params: { query: { branchId: branchId as number } } })),
    enabled: allowed && branchId != null,
  });
  const [q, setQ] = useState("");
  const [idleOnly, setIdleOnly] = useState(false);
  const [open, setOpen] = useState<BonusRow | null>(null);
  const rows = useMemo(
    () => (report.data?.rows ?? []).filter((r) => matchesDebt({ name: r.supplier, tin: r.tin }, q) && (!idleOnly || isIdle(r))),
    [report.data, q, idleOnly],
  );

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (me.data && branchId == null) return <EmptyState icon={Gift} title={t("noBranch.title")} description={t("noBranch.description")} />;

  const columns: TableColumn<BonusRow>[] = [
    {
      key: "supplier",
      title: t("col.supplier"),
      render: (r) => (
        <div className="min-w-0">
          <div>{r.supplier}</div>
          <div className="font-mono text-caption text-text-secondary">{r.tin}</div>
        </div>
      ),
    },
    { key: "balance", title: t("balance"), align: "right", render: (r) => money(r.balance) },
    { key: "pending", title: t("pending"), align: "right", render: (r) => money(r.pending) },
    { key: "nextBonusDate", title: t("col.bonusDate"), render: (r) => formatIsoDate(r.nextBonusDate) },
    {
      key: "idleDays",
      title: t("col.idle"),
      render: (r) =>
        isIdle(r) ? (
          <Badge tone="warning" icon={AlarmClock}>
            {t("days", { count: r.idleDays ?? 0 })}
          </Badge>
        ) : r.idleDays != null ? (
          <span className="text-text-secondary">{t("days", { count: r.idleDays })}</span>
        ) : null,
    },
    { key: "lastMoveAt", title: t("col.lastMove"), render: (r) => (r.lastMoveAt ? formatDateTime(new Date(r.lastMoveAt)) : "") },
  ];
  const d = report.data;

  return (
    <>
      <h1 className="mb-4 text-page-title">{t("title")}</h1>
      {d ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <div className="text-caption text-text-secondary">{t("balance")}</div>
            <div className="mt-1 font-mono text-subtitle tabular-nums">
              {formatMoney(d.balance)} {t("currency")}
            </div>
          </Card>
          <Card>
            <div className="text-caption text-text-secondary">{t("pendingBonuses")}</div>
            <div className="mt-1 font-mono text-subtitle tabular-nums">
              {formatMoney(d.pending)} {t("currency")}
            </div>
          </Card>
          <Card>
            <div className="text-caption text-text-secondary">{t("idleOver", { days: IDLE_DAYS })}</div>
            <div className="mt-1 text-subtitle tabular-nums">{t("suppliersCount", { count: d.idle })}</div>
          </Card>
        </div>
      ) : null}
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption={t("balance")}
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.supplierId)}
          loading={report.isPending}
          onRowClick={setOpen}
          totals={d ? { supplier: t("total"), balance: money(d.balance), pending: money(d.pending) } : undefined}
          toolbar={
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-72">
                <TextField label={t("search")} variant="search" size="sm" value={q} onChange={setQ} placeholder={t("searchPlaceholder")} />
              </div>
              <Checkbox label={t("idleOver", { days: IDLE_DAYS })} checked={idleOnly} onChange={setIdleOnly} />
            </div>
          }
          emptyState={
            q || idleOnly ? (
              <NoResultsState
                onClearFilters={() => {
                  setQ("");
                  setIdleOnly(false);
                }}
              />
            ) : (
              <EmptyState icon={Gift} title={t("empty.title")} description={t("empty.description")} />
            )
          }
        />
      )}
      {open && branchId != null ? <BonusDrawer row={open} branchId={branchId} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function BonusDrawer(props: { row: BonusRow; branchId: number; onClose: () => void }) {
  const t = useTranslations("bonuses");
  const detail = useQuery({
    queryKey: ["supplier-bonuses", props.branchId, props.row.supplierId],
    queryFn: () =>
      unwrap(
        api.GET("/api/supplier-bonuses/{supplierId}", {
          params: { path: { supplierId: props.row.supplierId }, query: { branchId: props.branchId } },
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
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind={t("col.supplier")}
      title={props.row.supplier}
      subtitle={t("tin", { tin: props.row.tin })}
    >
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
