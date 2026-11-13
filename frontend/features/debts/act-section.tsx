"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Printer, ScrollText } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { TextField } from "@/components/ui/text-field";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatMoney } from "@/lib/format";

type ActLine = components["schemas"]["ActLine"];

const amount = (v: string) => (v === "0.00" ? "" : <span className="tabular-nums">{formatMoney(v)}</span>);

/** Akt sverka: davr boshi + qarz oshdi − kamaydi = davr oxiri. Chop etish — server PDF (ikki tomon imzosi bilan). */
export function ActSection(props: { side: "CUSTOMER" | "SUPPLIER"; counterpartyId: number; branchId: number | null }) {
  const t = useTranslations("debts.act");
  const today = todayTashkent();
  const [from, setFrom] = useState(formatIsoDate(`${today.slice(0, 8)}01`));
  const [to, setTo] = useState(formatIsoDate(today));
  const isoFrom = parseUzDate(from);
  const isoTo = parseUzDate(to);
  const enabled = props.branchId != null && isoFrom !== null && isoTo !== null;
  const act = useQuery({
    queryKey: ["debts", props.side, "act", props.counterpartyId, props.branchId, isoFrom, isoTo],
    queryFn: () => {
      const params = {
        path: { id: props.counterpartyId },
        query: { branchId: props.branchId as number, from: isoFrom ?? undefined, to: isoTo ?? undefined },
      };
      return props.side === "CUSTOMER"
        ? unwrap(api.GET("/api/debts/customers/{id}/act", { params }))
        : unwrap(api.GET("/api/debts/suppliers/{id}/act", { params }));
    },
    enabled,
  });

  if (props.branchId == null) {
    return <EmptyState icon={ScrollText} title={t("noBranch.title")} description={t("noBranch.description")} />;
  }

  const columns: TableColumn<ActLine>[] = [
    { key: "date", title: t("col.date"), render: (l) => formatIsoDate(l.date) },
    { key: "docNumber", title: t("col.document"), mono: true },
    { key: "note", title: t("col.note"), render: (l) => l.note ?? "" },
    { key: "debit", title: t(`debit.${props.side}`), align: "right", render: (l) => amount(l.debit) },
    { key: "credit", title: t("credit"), align: "right", render: (l) => amount(l.credit) },
    {
      key: "balance",
      title: t("col.balance"),
      align: "right",
      render: (l) => <span className="tabular-nums">{formatMoney(l.balance)}</span>,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="w-40">
          <TextField
            variant="date"
            label={t("from")}
            size="sm"
            value={from}
            onChange={setFrom}
            error={isoFrom === null ? t("badDate") : undefined}
          />
        </div>
        <div className="w-40">
          <TextField
            variant="date"
            label={t("to")}
            size="sm"
            value={to}
            onChange={setTo}
            error={isoTo === null ? t("badDate") : undefined}
          />
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={Printer}
          disabled={!act.data}
          onClick={() => openActPdf(props, isoFrom ?? null, isoTo ?? null)}
        >
          {t("print")}
        </Button>
      </div>
      {act.data ? (
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Sum label={t("opening", { date: formatIsoDate(act.data.from) })} value={act.data.opening} currency={t("currency")} />
          <Sum label={t("debit.CUSTOMER")} value={act.data.debitTotal} currency={t("currency")} />
          <Sum label={t("credit")} value={act.data.creditTotal} currency={t("currency")} />
          <Sum label={t("closing", { date: formatIsoDate(act.data.to) })} value={act.data.closing} currency={t("currency")} strong />
        </dl>
      ) : null}
      {act.error ? (
        <ErrorState onRetry={() => act.refetch()} />
      ) : (
        <Table
          caption={t("caption", { name: act.data?.name ?? "", branch: act.data?.branch ?? "" })}
          density="compact"
          columns={columns}
          rows={act.data?.lines ?? []}
          rowKey={(l) => `${l.docType}:${l.docId}:${l.occurredAt}:${l.balance}`}
          loading={enabled && act.isPending}
          emptyState={<EmptyState icon={ScrollText} title={t("empty.title")} description={t("empty.description")} />}
        />
      )}
      <p className="text-caption text-text-secondary">{t(`legend.${props.side}`)}</p>
    </div>
  );
}

/** Server PDF yangi oynada: /api/debts/{customers|suppliers}/{id}/act/pdf?branchId&from&to. */
export function actPdfUrl(
  props: { side: "CUSTOMER" | "SUPPLIER"; counterpartyId: number; branchId: number | null },
  from: string | null,
  to: string | null,
): string {
  const q = new URLSearchParams();
  if (props.branchId != null) q.set("branchId", String(props.branchId));
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const kind = props.side === "CUSTOMER" ? "customers" : "suppliers";
  return `/api/debts/${kind}/${props.counterpartyId}/act/pdf?${q.toString()}`;
}

function openActPdf(
  props: { side: "CUSTOMER" | "SUPPLIER"; counterpartyId: number; branchId: number | null },
  from: string | null,
  to: string | null,
) {
  window.open(actPdfUrl(props, from, to), "_blank", "noopener");
}

function Sum(props: { label: string; value: string; currency: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-caption text-text-secondary">{props.label}</dt>
      <dd className={`font-mono tabular-nums ${props.strong ? "text-subtitle" : ""}`}>
        {formatMoney(props.value)} {props.currency}
      </dd>
    </div>
  );
}
