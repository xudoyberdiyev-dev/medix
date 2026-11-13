"use client";

import { ArrowUpRight, Ban, Building2, CircleCheck, CirclePause, Lock, Pencil } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type ReactNode } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { Tabs } from "@/components/ui/tabs";
import { toast } from "@/components/ui/toast";
import { useQuery } from "@tanstack/react-query";
import { can } from "@/features/auth/can";
import { BONUS_VIEW } from "@/features/bonuses/bonus-page";
import { api, unwrap } from "@/lib/api/client";
import { useMe } from "@/features/auth/session";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";

import {
  canBlockCard,
  canEditCard,
  formatIsoDate,
  useActivateCounterparty,
  useBlockCounterparty,
  useCounterparty,
  useCounterpartySummary,
  type CounterpartyDetail,
  type CounterpartyRole,
} from "./api";
import { LicenseBadge, StatusBadge } from "./counterparties-page";
import { ContractsTab, LicensesTab, TermsTab } from "./counterparty-drawer";
import { DocumentsTab } from "./documents-tab";
import { CardHistory } from "./card-history";
import { docSections, sectionPermissions, type DocSection } from "./documents-model";
import { ProductsTab, ReconTab } from "./card-extra-tabs";
import { CustomerCodesTab } from "./codes-tab";
import { cents } from "./overview-model";

const todayIso = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());

const BASE_TABS = ["general", "licenses", "terms", "contracts"] as const;
type Tab = (typeof BASE_TABS)[number] | DocSection | "recon" | "products" | "codes" | "history";
/** Prototip tartibi: Umumiy, Litsenziyalar, Shartlar, Buyurtmalar/Kirimlar, … hujjat yorliqlari, Akt sverka, (YB) Mahsulotlar, Shartnomalar, Tarix. */
const tabsFor = (customers: boolean): Tab[] => [
  ...BASE_TABS.slice(0, 3),
  ...docSections(customers),
  "recon",
  ...(customers ? (["codes"] as const) : (["products"] as const)),
  "contracts",
  "history",
];

function InfoList({ title, rows }: { title: string; rows: [string, ReactNode, boolean?][] }) {
  return (
    <section className="rounded-card border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-4 text-[15px] font-semibold">{title}</h2>
      <dl className="px-5 py-2">
        {rows.map(([label, value, mono]) => (
          <div key={label} className="flex gap-4 border-b border-border py-2.5 last:border-b-0">
            <dt className="w-44 shrink-0 text-caption text-text-secondary">{label}</dt>
            <dd className={cn("min-w-0 break-words", mono && value ? "font-mono text-[13px]" : "", value ? "" : "text-text-disabled")}>
              {value || "—"}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** YB kartochkasi: bonus balansi va kutilayotgan bonus (prototip CounterpartyCard; manba — «Bonus balans» sahifasi bilan bir xil API). */
function SupplierBonusTiles({ supplierId, branchId }: { supplierId: number; branchId: number }) {
  const t = useTranslations("counterparties.card");
  const me = useMe();
  const allowed = BONUS_VIEW.some((k) => can(me.data, k));
  const q = useQuery({
    queryKey: ["supplier-bonuses", branchId, supplierId],
    queryFn: () => unwrap(api.GET("/api/supplier-bonuses/{supplierId}", { params: { path: { supplierId }, query: { branchId } } })),
    enabled: allowed,
  });
  if (!allowed) return null;
  const pending = q.data?.pending ?? [];
  const pendingSum = pending.reduce((a, p) => a + cents(p.amount), 0n);
  return (
    <>
      <Tile label={t("bonusBal")} value={q.data && cents(q.data.balance) > 0n ? formatMoney(q.data.balance) : "—"} href="/bonuses" />
      <Tile
        label={t("bonusPending")}
        value={pendingSum > 0n ? formatMoney(`${pendingSum / 100n}.${(pendingSum % 100n).toString().padStart(2, "0")}`) : "—"}
        sub={pending.length ? t("bonusPendingN", { n: pending.length }) : undefined}
      />
    </>
  );
}

function Tile({ label, value, sub, tone, href }: { label: string; value: ReactNode; sub?: ReactNode; tone?: "danger"; href?: string }) {
  const v = (
    <span
      className={cn("text-[17px] leading-6 font-semibold tabular-nums", href && "whitespace-nowrap", tone === "danger" && "text-danger")}
    >
      {value}
      {href ? <ArrowUpRight size={14} strokeWidth={1.5} className="ml-1 inline text-primary-button" aria-hidden /> : null}
    </span>
  );
  return (
    <div className="flex min-h-24 flex-col gap-1.5 rounded-card border border-border bg-surface p-4">
      <span className="text-caption text-text-secondary">{label}</span>
      {href ? (
        <Link href={href} className="hover:underline">
          {v}
        </Link>
      ) : (
        v
      )}
      {sub ? <span className="text-caption text-text-secondary">{sub}</span> : null}
    </div>
  );
}

const fmtTin = (tin: string) => tin.replace(/^(\d{3})(\d{3})(\d{3})$/, "$1 $2 $3");
const fmtAccount = (a: string) => a.replace(/(\d{4})(?=\d)/g, "$1 ");

/**
 * Kontragent kartochkasi (prototip `CounterpartyCard`): sarlavha (Mijozlar / nom, holat, tur, litsenziya, nazoratdagi; hudud · yuridik
 * nom · STIR), «…» va «Tahrirlash», yorliqlar Umumiy / Litsenziyalar / Filiallar boʻyicha shartlar / Shartnomalar. Umumiy — asosiy
 * maʼlumot, kontakt, bank va oʻng panel (filial tanlagich, qarz, muddati oʻtgan, limit, narx turi, avans, oxirgi sotuv/kirim va toʻlov,
 * masʼul, filiallar boʻyicha qarz).
 */
export function CounterpartyCardPage({ id, role }: { id: number; role: CounterpartyRole }) {
  const cp = useCounterparty(id);
  if (cp.error) return <ErrorState error={cp.error} onRetry={() => cp.refetch()} />;
  if (!cp.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-12 w-1/2" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  return <Card c={cp.data} role={role} />;
}

function Card({ c, role }: { c: CounterpartyDetail; role: CounterpartyRole }) {
  const t = useTranslations("counterparties.card");
  const tl = useTranslations("counterparties.overview");
  const td = useTranslations("counterparties.docs");
  const me = useMe();
  const customers = role === "CUSTOMER";
  const canEdit = canEditCard(me.data?.permissions, c.customer, c.supplier);
  const canBlock = canBlockCard(me.data?.permissions, c.customer, c.supplier);
  const summary = useCounterpartySummary(c.id, role);
  const block = useBlockCounterparty();
  const activate = useActivateCounterparty();
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(
    (tabsFor(customers) as string[]).includes(params.get("tab") ?? "") ? (params.get("tab") as Tab) : "general",
  );
  const [dialog, setDialog] = useState<"block" | "inactive" | null>(null);
  const [branch, setBranch] = useState<number | null>(null);
  const branches = summary.data?.branches ?? [];
  const sel = branches.find((b) => b.branchId === branch) ?? branches.find((b) => b.hasTerms) ?? branches[0];
  const ctrl = c.licenses.some((l) => l.controlledAllowed && (!l.validUntil || l.validUntil >= new Date().toISOString().slice(0, 10)));
  const best =
    c.licenses
      .map((l) => l.validUntil)
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1) ?? null;
  const listHref = customers ? "/customers" : "/suppliers";

  const menu: RowMenuItem[] = [
    ...(canBlock
      ? [
          c.blocked
            ? {
                key: "unblock",
                label: tl("aActivate"),
                icon: <CircleCheck size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () =>
                  block.mutate(
                    { id: c.id, reason: null },
                    { onSuccess: () => toast({ tone: "success", title: tl("tActivated", { name: c.name }) }) },
                  ),
              }
            : {
                key: "block",
                label: tl("aBlock"),
                icon: <Ban size={16} strokeWidth={1.5} className="text-danger" aria-hidden />,
                onSelect: () => setDialog("block"),
              },
        ]
      : []),
    ...(canEdit
      ? [
          c.active
            ? {
                key: "inactive",
                label: tl("aInactive"),
                icon: <CirclePause size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () => setDialog("inactive"),
              }
            : {
                key: "active",
                label: tl("aActivate"),
                icon: <CircleCheck size={16} strokeWidth={1.5} aria-hidden />,
                onSelect: () =>
                  activate.mutate(
                    { id: c.id, reason: null },
                    { onSuccess: () => toast({ tone: "success", title: tl("tActivated", { name: c.name }) }) },
                  ),
              },
        ]
      : []),
  ];

  const counts: Partial<Record<Tab, number>> = {
    licenses: c.licenses.length,
    terms: c.terms.length,
    contracts: c.contracts.length,
  };
  const maxDebt = branches.reduce((m, b) => (cents(b.debt) > m ? cents(b.debt) : m), 0n);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <DocumentHeader
        parent={{ label: customers ? tl("titleC") : tl("titleS"), href: listHref }}
        crumb={c.name}
        title={c.name}
        status={
          <span className="flex flex-wrap items-center gap-1.5">
            <StatusBadge blocked={c.blocked} active={c.active} />
            {c.kind ? (
              <Badge tone="neutral" icon={Building2}>
                {tl(`kind.${c.kind}`)}
              </Badge>
            ) : null}
            <LicenseBadge validUntil={best} />
            {ctrl ? (
              <Badge tone="danger" icon={Lock}>
                {t("ctrl")}
              </Badge>
            ) : null}
          </span>
        }
        sub={
          <span className="flex flex-wrap items-center gap-x-1.5">
            {[c.region?.name, c.legalName].filter(Boolean).join(" · ")}
            {c.region?.name || c.legalName ? " · " : ""}
            <span className="font-mono text-[13px]">STIR {fmtTin(c.tin)}</span>
          </span>
        }
        actions={
          canEdit || canBlock ? (
            <>
              {menu.length ? <RowMenu label={t("more")} items={menu} /> : null}
              {canEdit ? (
                <Button icon={Pencil} onClick={() => router.push(`${customers ? "/customers" : "/suppliers"}/${c.id}/edit`)}>
                  {t("edit")}
                </Button>
              ) : null}
            </>
          ) : (
            <Badge tone="neutral">{t("readOnly")}</Badge>
          )
        }
      />
      {c.blocked && c.blockedReason ? (
        <div className="rounded-card border border-danger/30 bg-danger-bg px-4 py-3 text-danger">
          {t("blocked", { reason: c.blockedReason })}
        </div>
      ) : null}
      <Tabs
        aria-label={t("tabsLabel")}
        items={tabsFor(customers).map((k) => ({
          key: k,
          label:
            k === "history"
              ? td("hist.tab")
              : k === "recon"
                ? td("tab.RECON")
                : k === "products"
                  ? td("tab.PRODUCTS")
                  : k === "codes"
                    ? t("tab.codes")
                    : k === "general" || k === "licenses" || k === "terms" || k === "contracts"
                      ? t(`tab.${k}`)
                      : td(`tab.${k}`),
          count: counts[k],
        }))}
        value={tab}
        onChange={(k) => setTab(k as Tab)}
      />
      {tab === "general" ? (
        <div className="flex flex-wrap items-start gap-6">
          <div className="flex min-w-0 flex-[1_1_520px] flex-col gap-4">
            <InfoList
              title={t("iBasic")}
              rows={[
                [t("legalName"), c.legalName],
                [t("shortName"), c.name],
                [t("tin"), fmtTin(c.tin), true],
                [t("kind"), c.kind ? tl(`kind.${c.kind}`) : null],
                [t("region"), c.region?.name],
                [t("address"), c.address],
                [t("phone"), c.phone, true],
                [t("email"), c.email],
                [t("roles"), [c.customer ? tl("roleC") : "", c.supplier ? tl("roleS") : ""].filter(Boolean).join(", ")],
                ...(c.note ? ([[t("note"), c.note]] as [string, ReactNode][]) : []),
              ]}
            />
            <section className="rounded-card border border-border bg-surface">
              <h2 className="border-b border-border px-5 py-4 text-[15px] font-semibold">{t("iContacts")}</h2>
              {c.contactPerson ? (
                <div className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={c.contactPerson} size="sm" />
                  <span className="flex-1 font-medium">{c.contactPerson}</span>
                  {c.phone ? <span className="font-mono text-[13px]">{c.phone}</span> : null}
                </div>
              ) : (
                <p className="px-5 py-4 text-text-secondary">{t("noContacts")}</p>
              )}
            </section>
            <InfoList
              title={t("iBank")}
              rows={[
                [t("bank"), c.bankName],
                [t("mfo"), c.bankMfo, true],
                [t("account"), c.bankAccount ? fmtAccount(c.bankAccount) : null, true],
                [t("vat"), c.vatCode, true],
              ]}
            />
          </div>
          <aside className="flex min-w-0 flex-[0_1_340px] flex-col gap-3">
            {summary.error ? <ErrorState onRetry={() => summary.refetch()} /> : null}
            {summary.isPending ? <Skeleton className="h-64 w-full" /> : null}
            {summary.data && !sel ? <p className="text-text-secondary">{t("noBranches")}</p> : null}
            {sel ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{t("branch", { name: sel.name })}</span>
                  {branches.length > 1 ? (
                    <div role="radiogroup" aria-label={t("byBranch")} className="flex rounded-control bg-background p-0.5">
                      {branches.map((b) => (
                        <button
                          key={b.branchId}
                          type="button"
                          role="radio"
                          aria-checked={b.branchId === sel.branchId}
                          onClick={() => setBranch(b.branchId)}
                          className={cn(
                            "rounded-[6px] px-2.5 py-1 text-[13px] font-medium",
                            b.branchId === sel.branchId ? "bg-surface text-text-primary shadow-sm" : "text-text-secondary",
                          )}
                        >
                          {b.code}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
                {!sel.hasTerms ? <p className="text-caption text-text-secondary">{t("noTerms")}</p> : null}
                <div className="grid grid-cols-2 gap-3">
                  <Tile
                    label={customers ? t("debt") : t("ourDebt")}
                    value={formatMoney(sel.debt)}
                    tone={cents(sel.overdue) > 0n ? "danger" : undefined}
                    href={customers ? "/debts/customers" : "/debts/suppliers"}
                  />
                  <Tile
                    label={t("overdue")}
                    value={cents(sel.overdue) > 0n ? formatMoney(sel.overdue) : "—"}
                    tone={cents(sel.overdue) > 0n ? "danger" : undefined}
                    sub={cents(sel.overdue) > 0n ? tl("late", { n: sel.maxOverdueDays }) : undefined}
                  />
                  {!customers ? (
                    <Tile
                      label={t("nextDue")}
                      value={sel.nextDue ? formatIsoDate(sel.nextDue.date) : "—"}
                      tone={sel.nextDue && sel.nextDue.date < todayIso() ? "danger" : undefined}
                      sub={sel.nextDue ? `${formatMoney(sel.nextDue.amount)} · ${sel.nextDue.number}` : undefined}
                    />
                  ) : null}
                  {!customers ? <SupplierBonusTiles supplierId={c.id} branchId={sel.branchId} /> : null}
                  {customers ? (
                    <>
                      <Tile
                        label={t("limit")}
                        value={sel.creditLimit ? formatMoney(sel.creditLimit) : "—"}
                        sub={sel.limitLeft ? t("limitLeft", { sum: formatMoney(sel.limitLeft) }) : undefined}
                      />
                      <Tile label={t("price")} value={sel.priceType ?? "—"} />
                    </>
                  ) : (
                    <Tile label={t("payDays")} value={sel.paymentDays != null ? tl("daysN", { n: sel.paymentDays }) : "—"} />
                  )}
                  <Tile label={t("advance")} value={cents(sel.advance) > 0n ? formatMoney(sel.advance) : "—"} />
                  <Tile
                    label={customers ? t("lastSale") : t("lastIn")}
                    value={sel.lastDoc ? formatIsoDate(sel.lastDoc.date) : "—"}
                    href={sel.lastDoc?.id ? (customers ? `/orders/${sel.lastDoc.id}` : `/receipts/${sel.lastDoc.id}`) : undefined}
                    sub={sel.lastDoc ? `${formatMoney(sel.lastDoc.amount)} · ${sel.lastDoc.number}` : undefined}
                  />
                  <Tile
                    label={t("lastPay")}
                    value={sel.lastPayment ? formatIsoDate(sel.lastPayment.date) : "—"}
                    sub={sel.lastPayment ? `${formatMoney(sel.lastPayment.amount)} · ${sel.lastPayment.number}` : undefined}
                  />
                  <Tile label={customers ? t("operator") : t("buyer")} value={sel.operator ?? "—"} />
                </div>
                <section className="rounded-card border border-border bg-surface">
                  <h2 className="border-b border-border px-4 py-3 text-[15px] font-semibold">{t("byBranch")}</h2>
                  <ul className="flex flex-col gap-3 px-4 py-3">
                    {branches.map((b) => (
                      <li key={b.branchId} className="flex flex-col gap-1.5">
                        <span className="flex justify-between gap-2">
                          <span>{b.name}</span>
                          <span className="tabular-nums">{formatMoney(b.debt)}</span>
                        </span>
                        <span className="h-1 rounded-full bg-background">
                          <span
                            className="block h-1 rounded-full bg-primary-button"
                            style={{ width: maxDebt > 0n ? `${Number((cents(b.debt) * 100n) / maxDebt)}%` : "0%" }}
                          />
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            ) : null}
          </aside>
        </div>
      ) : null}
      {tab === "licenses" ? <LicensesTab cp={c} canEdit={can(me.data, "clients.lic")} /> : null}
      {tab === "terms" ? <TermsTab cp={c} /> : null}
      {tab === "contracts" ? <ContractsTab cp={c} canEdit={canEdit} /> : null}
      {tab === "history" ? <CardHistory id={c.id} role={role} /> : null}
      {tab === "recon" ? (
        <ReconTab
          id={c.id}
          role={role}
          branches={branches}
          defaultBranch={sel?.branchId ?? null}
          allowed={can(me.data, customers ? "cdebt.view" : "sdebt.view")}
        />
      ) : null}
      {tab === "products" ? <ProductsTab id={c.id} allowed={can(me.data, "receipt.view")} /> : null}
      {tab === "codes" ? <CustomerCodesTab id={c.id} allowed={can(me.data, "clients.view") || can(me.data, "marking.view")} /> : null}
      {tab !== "general" &&
      tab !== "licenses" &&
      tab !== "terms" &&
      tab !== "contracts" &&
      tab !== "history" &&
      tab !== "recon" &&
      tab !== "products" &&
      tab !== "codes" ? (
        <DocumentsTab
          key={tab}
          id={c.id}
          role={role}
          section={tab}
          allowed={sectionPermissions(tab, customers).some((k) => can(me.data, k))}
        />
      ) : null}
      {dialog ? (
        <DeactivateDialog
          title={tl(dialog === "block" ? "dBlockT" : "dInactT", { name: c.name })}
          consequence={tl(dialog === "block" ? "dBlockC" : "dInactC")}
          actionLabel={tl(dialog === "block" ? "dBlockGo" : "dInactGo")}
          pending={block.isPending || activate.isPending}
          error={block.error ?? activate.error}
          onConfirm={(reason) =>
            (dialog === "block" ? block : activate).mutate(
              { id: c.id, reason },
              {
                onSuccess: () => {
                  toast({ tone: "success", title: tl(dialog === "block" ? "tBlocked" : "tInact", { count: "1" }) });
                  setDialog(null);
                },
              },
            )
          }
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}
