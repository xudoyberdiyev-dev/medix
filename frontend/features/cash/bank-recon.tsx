"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { CircleCheck, Landmark, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import type { MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime, formatMoney } from "@/lib/format";
import { fromCents, isDocTitleKey, toCents, type Move } from "./api";

type Reconciliation = components["schemas"]["Reconciliation"];

const money = (v: string) => <span className="tabular-nums">{formatMoney(v)}</span>;

/** Bank va MEDIX qoldigʻi farqi (tiyinlarda, float yoʻq). Kiritilmagan yoki notoʻgʻri summa — null. */
export function reconDiff(bankInput: string, medix: string): string | null {
  const bank = bankInput.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(bank)) return null;
  return fromCents(toCents(bank) - toCents(medix));
}

/** Kassa → «Bank koʻchirmasi»: koʻchirma sanasidagi bank qoldigʻi MEDIX jurnali bilan solishtiriladi, bankda bor harakatlar belgilanadi. */
export function BankReconTab(props: { accounts: MoneyAccount[]; canEdit: boolean }) {
  const t = useTranslations("cash.bank");
  const tc = useTranslations("cash");
  const qc = useQueryClient();
  const banks = props.accounts.filter((a) => a.kind === "BANK");
  const [account, setAccount] = useState<string | null>(banks[0] ? String(banks[0].id) : null);
  const [date, setDate] = useState(formatIsoDate(todayTashkent()));
  const [bankBalance, setBankBalance] = useState("");
  const [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const iso = parseUzDate(date);
  const accountId = account ? Number(account) : null;
  const preview = useQuery({
    queryKey: ["bank-recon", "preview", accountId, iso],
    queryFn: () =>
      unwrap(
        api.GET("/api/bank-reconciliations/preview", { params: { query: { accountId: accountId as number, date: iso ?? undefined } } }),
      ),
    enabled: accountId != null && iso !== null,
  });
  const history = useQuery({
    queryKey: ["bank-recon", "list", accountId],
    queryFn: () => unwrap(api.GET("/api/bank-reconciliations", { params: { query: { accountId: accountId as number } } })),
    enabled: accountId != null,
  });

  if (banks.length === 0) return <EmptyState icon={Landmark} title={t("noAccount.title")} description={t("noAccount.description")} />;

  const p = preview.data;
  const diff = p ? reconDiff(bankBalance, p.medixBalance) : null;

  async function save() {
    if (!p || accountId == null || !iso) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const r = await unwrap(
        api.POST("/api/bank-reconciliations", {
          body: {
            accountId,
            statementDate: iso,
            bankBalance: bankBalance.trim(),
            moveIds: selected.map(Number),
            note: note.trim() || undefined,
          },
        }),
      );
      toast({
        tone: "success",
        title: t("saved"),
        description: r.difference === "0.00" ? t("savedMatch") : t("diff", { amount: formatMoney(r.difference) }),
      });
      setSelected([]);
      setBankBalance("");
      setNote("");
      await qc.invalidateQueries({ queryKey: ["bank-recon"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const moveColumns: TableColumn<Move>[] = [
    { key: "moveDate", title: tc("col.date"), render: (m) => formatIsoDate(m.moveDate) },
    {
      key: "docNumber",
      title: tc("col.document"),
      mono: true,
      render: (m) => <span title={isDocTitleKey(m.docType) ? tc(`docType.${m.docType}`) : m.docType}>{m.docNumber}</span>,
    },
    { key: "note", title: tc("col.note"), render: (m) => m.note ?? "" },
    { key: "in", title: tc("col.in"), align: "right", render: (m) => (m.amount.startsWith("-") ? "" : money(m.amount)) },
    { key: "out", title: tc("col.out"), align: "right", render: (m) => (m.amount.startsWith("-") ? money(m.amount.slice(1)) : "") },
  ];
  const historyColumns: TableColumn<Reconciliation>[] = [
    { key: "statementDate", title: t("statementDate"), render: (r) => formatIsoDate(r.statementDate) },
    { key: "bankBalance", title: t("col.bank"), align: "right", render: (r) => money(r.bankBalance) },
    { key: "medixBalance", title: "MEDIX", align: "right", render: (r) => money(r.medixBalance) },
    {
      key: "difference",
      title: tc("col.diff"),
      render: (r) =>
        r.difference === "0.00" ? (
          <Badge tone="success" icon={CircleCheck}>
            {t("match")}
          </Badge>
        ) : (
          <Badge tone="warning" icon={TriangleAlert}>
            {formatMoney(r.difference)}
          </Badge>
        ),
    },
    { key: "moves", title: t("col.moves"), align: "right" },
    { key: "note", title: tc("col.note"), render: (r) => r.note ?? "" },
    { key: "createdBy", title: t("col.who"), render: (r) => `${r.createdBy} · ${formatDateTime(new Date(r.createdAt))}` },
  ];
  const err = describeError(error);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-72">
          <Select
            label={t("account")}
            value={account}
            onChange={(v) => {
              setAccount(v);
              setSelected([]);
            }}
            options={banks.map((a) => ({ value: String(a.id), label: a.name, sub: a.accountNo ?? a.code }))}
          />
        </div>
        <div className="w-40">
          <TextField
            variant="date"
            label={t("statementDate")}
            value={date}
            onChange={(v) => {
              setDate(v);
              setSelected([]);
            }}
            placeholder="04.10.2026"
            error={iso === null ? t("dateExample") : undefined}
          />
        </div>
      </div>
      {preview.error ? (
        <ErrorState onRetry={() => preview.refetch()} />
      ) : !p ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Card>
              <div className="text-caption text-text-secondary">{t("medixBalance", { date: formatIsoDate(p.date) })}</div>
              <div className="mt-1 font-mono text-subtitle tabular-nums">
                {formatMoney(p.medixBalance)} {tc("currency")}
              </div>
            </Card>
            <Card>
              <div className="text-caption text-text-secondary">{t("last")}</div>
              <div className="mt-1">
                {p.lastDate ? (
                  <>
                    {formatIsoDate(p.lastDate)} ·{" "}
                    <span className="font-mono tabular-nums">
                      {formatMoney(p.lastBankBalance ?? "0")} {tc("currency")}
                    </span>
                  </>
                ) : (
                  <span className="text-text-secondary">{t("never")}</span>
                )}
              </div>
            </Card>
            <Card>
              <div className="text-caption text-text-secondary">{t("unmatched")}</div>
              <div className="mt-1">
                {t.rich("unmatchedSummary", {
                  count: p.unmatched.length,
                  amount: formatMoney(p.unmatchedTotal),
                  num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
                })}
              </div>
            </Card>
          </div>
          <section>
            <h2 className="mb-2 text-subtitle">{t("markTitle")}</h2>
            <Table
              caption={t("unmatched")}
              density="compact"
              columns={moveColumns}
              rows={p.unmatched}
              rowKey={(m) => String(m.id)}
              selectable={props.canEdit}
              selectedKeys={selected}
              onSelectionChange={setSelected}
              emptyState={<EmptyState icon={CircleCheck} title={t("allMatched.title")} description={t("allMatched.description")} />}
            />
          </section>
          {props.canEdit ? (
            <Card>
              <div className="flex flex-col gap-4">
                {err.message ? <Alert tone="danger" title={err.message} /> : null}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <TextField
                    label={t("bankBalance")}
                    variant="amount"
                    value={bankBalance}
                    onChange={setBankBalance}
                    suffix={tc("currency")}
                    required
                  />
                  <TextField
                    label={tc("col.note")}
                    value={note}
                    onChange={setNote}
                    maxLength={500}
                    hint={diff && diff !== "0.00" ? t("diffHint") : undefined}
                  />
                </div>
                {diff === "0.00" ? (
                  <Alert tone="success" title={t("matchAlert")} />
                ) : diff ? (
                  <Alert tone="warning" title={t("diff", { amount: formatMoney(diff) })}>
                    {t("diffAlert")}
                  </Alert>
                ) : null}
                <div>
                  <Button loading={pending} disabled={diff === null} onClick={() => void save()}>
                    {t("submit")}
                  </Button>
                </div>
              </div>
            </Card>
          ) : null}
        </>
      )}
      <section>
        <h2 className="mb-2 text-subtitle">{t("history")}</h2>
        {history.error ? (
          <ErrorState onRetry={() => history.refetch()} />
        ) : (
          <Table
            caption={t("history")}
            density="compact"
            columns={historyColumns}
            rows={history.data ?? []}
            rowKey={(r) => String(r.id)}
            loading={history.isPending}
            emptyState={<EmptyState icon={Landmark} title={t("historyEmpty.title")} description={t("historyEmpty.description")} />}
          />
        )}
      </section>
    </div>
  );
}
