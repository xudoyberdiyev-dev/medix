"use client";

import { useQuery } from "@tanstack/react-query";
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

const DOC_LABEL: Record<string, string> = { BNS: "Bonus tasdiqlandi", KR: "Bonus hisobidan kirim" };

/**
 * Pul → Bonus balans (SPEC 5.1): YB chegirmasi qarzdan ayrilmaydi — «Bonus tasdiqlandi» (BNS) bilan balansga tushadi va keyingi
 * kirimlarda ishlatiladi. Balans faqat jurnaldan; kutilayotgan — chegirmali, lekin hali tasdiqlanmagan kirimlar.
 */
export function BonusPage() {
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

  if (me.data && !allowed) return <ForbiddenState description="«Bonus balans» sahifasi sizning rolingiz uchun yopiq." />;
  if (me.data && branchId == null)
    return (
      <EmptyState icon={Gift} title="Filialni tanlang" description="Bonus balans filial boʻyicha yuritiladi — yuqorida filialni tanlang." />
    );

  const columns: TableColumn<BonusRow>[] = [
    {
      key: "supplier",
      title: "Yetkazib beruvchi",
      render: (r) => (
        <div className="min-w-0">
          <div>{r.supplier}</div>
          <div className="font-mono text-caption text-text-secondary">{r.tin}</div>
        </div>
      ),
    },
    { key: "balance", title: "Bonus balans", align: "right", render: (r) => money(r.balance) },
    { key: "pending", title: "Kutilayotgan", align: "right", render: (r) => money(r.pending) },
    { key: "nextBonusDate", title: "Olish sanasi", render: (r) => formatIsoDate(r.nextBonusDate) },
    {
      key: "idleDays",
      title: "Ishlatilmagan",
      render: (r) =>
        isIdle(r) ? (
          <Badge tone="warning" icon={AlarmClock}>
            {r.idleDays} kun
          </Badge>
        ) : r.idleDays != null ? (
          <span className="text-text-secondary">{r.idleDays} kun</span>
        ) : null,
    },
    { key: "lastMoveAt", title: "Oxirgi harakat", render: (r) => (r.lastMoveAt ? formatDateTime(new Date(r.lastMoveAt)) : "") },
  ];
  const d = report.data;

  return (
    <>
      <h1 className="mb-4 text-page-title">Bonus balans</h1>
      {d ? (
        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card>
            <div className="text-caption text-text-secondary">Bonus balans</div>
            <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(d.balance)} soʻm</div>
          </Card>
          <Card>
            <div className="text-caption text-text-secondary">Kutilayotgan bonuslar</div>
            <div className="mt-1 font-mono text-subtitle tabular-nums">{formatMoney(d.pending)} soʻm</div>
          </Card>
          <Card>
            <div className="text-caption text-text-secondary">{IDLE_DAYS} kundan koʻp ishlatilmagan</div>
            <div className="mt-1 text-subtitle tabular-nums">{d.idle} ta yetkazib beruvchi</div>
          </Card>
        </div>
      ) : null}
      {report.error ? (
        <ErrorState onRetry={() => report.refetch()} />
      ) : (
        <Table
          caption="Bonus balans"
          columns={columns}
          rows={rows}
          rowKey={(r) => String(r.supplierId)}
          loading={report.isPending}
          onRowClick={setOpen}
          totals={d ? { supplier: "Jami", balance: money(d.balance), pending: money(d.pending) } : undefined}
          toolbar={
            <div className="flex flex-wrap items-center gap-4">
              <div className="w-72">
                <TextField label="Qidirish" variant="search" size="sm" value={q} onChange={setQ} placeholder="Nomi yoki STIR" />
              </div>
              <Checkbox label={`${IDLE_DAYS} kundan koʻp ishlatilmagan`} checked={idleOnly} onChange={setIdleOnly} />
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
              <EmptyState
                icon={Gift}
                title="Bonus yoʻq"
                description="Kirimda chegirma kiritilsa, u shu yerda kutilayotgan bonus boʻlib koʻrinadi."
              />
            )
          }
        />
      )}
      {open && branchId != null ? <BonusDrawer row={open} branchId={branchId} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

function BonusDrawer(props: { row: BonusRow; branchId: number; onClose: () => void }) {
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
    { key: "at", title: "Sana", render: (m) => formatDateTime(new Date(m.at)) },
    {
      key: "docNumber",
      title: "Hujjat",
      render: (m) => (
        <div>
          <div className="font-mono">{m.docNumber}</div>
          <div className="text-caption text-text-secondary">{DOC_LABEL[m.docType] ?? m.docType}</div>
        </div>
      ),
    },
    {
      key: "amount",
      title: "Summa",
      align: "right",
      render: (m) => <span className={`tabular-nums ${m.amount.startsWith("-") ? "" : "text-success"}`}>{formatMoney(m.amount)}</span>,
    },
    { key: "balance", title: "Balans", align: "right", render: (m) => money(m.balance) },
    { key: "employee", title: "Xodim", render: (m) => m.employee ?? "" },
  ];
  const pendingColumns: TableColumn<PendingBonus>[] = [
    { key: "receiptNumber", title: "Kirim", mono: true },
    { key: "receiptDate", title: "Kirim sanasi", render: (p) => formatIsoDate(p.receiptDate) },
    {
      key: "bonusDate",
      title: "Olish sanasi",
      render: (p) =>
        p.overdue ? (
          <Badge tone="warning" icon={AlarmClock}>
            {formatIsoDate(p.bonusDate)} — vaqti oʻtgan
          </Badge>
        ) : (
          formatIsoDate(p.bonusDate)
        ),
    },
    { key: "amount", title: "Bonus", align: "right", render: (p) => money(p.amount) },
  ];
  return (
    <Drawer open onClose={props.onClose} size="lg" kind="Yetkazib beruvchi" title={props.row.supplier} subtitle={`STIR ${props.row.tin}`}>
      {detail.error ? (
        <ErrorState onRetry={() => detail.refetch()} />
      ) : (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-4">
            <div>
              <dt className="text-caption text-text-secondary">Bonus balans</dt>
              <dd className="font-mono tabular-nums">{formatMoney(detail.data?.balance ?? props.row.balance)} soʻm</dd>
            </div>
            <div>
              <dt className="text-caption text-text-secondary">Kutilayotgan</dt>
              <dd className="font-mono tabular-nums">{formatMoney(props.row.pending)} soʻm</dd>
            </div>
          </dl>
          <section>
            <h2 className="mb-2 text-subtitle">Kutilayotgan bonuslar</h2>
            <p className="mb-3 text-caption text-text-secondary">
              Olish sanasida kirim kartochkasida «Bonus tasdiqlandi» bosiladi — summa balansga tushadi.
            </p>
            <Table
              caption="Kutilayotgan bonuslar"
              density="compact"
              columns={pendingColumns}
              rows={detail.data?.pending ?? []}
              rowKey={(p) => String(p.receiptId)}
              loading={detail.isPending}
              emptyState={<EmptyState icon={Gift} title="Kutilayotgan bonus yoʻq" description="Chegirmali barcha kirimlar tasdiqlangan." />}
            />
          </section>
          <section>
            <h2 className="mb-2 text-subtitle">Harakatlar</h2>
            <Table
              caption="Bonus harakatlari"
              density="compact"
              columns={moveColumns}
              rows={detail.data?.moves ?? []}
              rowKey={(m) => `${m.docType}:${m.docId}:${m.at}:${m.amount}`}
              loading={detail.isPending}
              emptyState={<EmptyState icon={Gift} title="Harakat yoʻq" description="Bonus tasdiqlanganda shu yerda koʻrinadi." />}
            />
          </section>
        </div>
      )}
    </Drawer>
  );
}
