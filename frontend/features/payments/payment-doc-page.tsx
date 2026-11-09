"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowUp,
  Ban,
  Banknote,
  Check,
  CircleAlert,
  CircleCheck,
  CircleX,
  Clock,
  ClockAlert,
  CreditCard,
  FilePen,
  Hand,
  HandCoins,
  Landmark,
  PiggyBank,
  ReceiptText,
  Send,
  TriangleAlert,
  Undo2,
  Wallet,
  WandSparkles,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { HistoryTimeline } from "@/components/ui/history-timeline";
import { Modal } from "@/components/ui/modal";
import { RowMenu } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { Tabs } from "@/components/ui/tabs";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { CASH_APPROVE, usableAccount } from "@/features/cash/api";
import { formatIsoDate, parseUzDate, todayTashkent, useCounterparty } from "@/features/counterparties/api";
import { searchCustomers } from "@/features/orders/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import {
  PAYMENT_CANCEL,
  PAYMENT_MT,
  PAYMENT_YT,
  PAYMENT_YT_APPROVE,
  PAYMENT_YT_DIRECT,
  searchSuppliers,
  useAccounts,
  useOpenDocs,
  usePayment,
  useSupplierOpenDocs,
  useSupplierPayment,
  type MoneyAccount,
  type OpenDocs,
} from "./api";
import {
  autoAlloc,
  checkDoc,
  docSteps,
  gridRows,
  keyOf,
  postEffects,
  type AccountKind,
  type Field,
  type PayKind,
  type Problem,
} from "./doc-model";

type Status = "DRAFT" | "PENDING" | "POSTED" | "CANCELLED";

/** MT va YT tafsilotining umumiy koʻrinishi. */
interface Doc {
  id: number;
  number: string;
  status: Status;
  branchId: number;
  partyId: number;
  party: string;
  partyTin?: string | null;
  accountId: number;
  account: string;
  accountKind: string;
  paymentDate: string;
  amount: string;
  note?: string | null;
  payOrderNo?: string | null;
  bankDate?: string | null;
  checkNo?: string | null;
  advance?: string | null;
  allocations: { docType: string; docId: number; docNumber: string; amount: string }[];
  createdBy: string;
  createdAt: string;
  postedBy?: string | null;
  postedAt?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  sentBy?: string | null;
  sentAt?: string | null;
  returnedReason?: string | null;
}

const METHOD_ICON: Record<AccountKind, LucideIcon> = { CASH: Banknote, BANK: Landmark, TERMINAL: CreditCard };
const METHOD_KEY: Record<AccountKind, "m_cash" | "m_bank" | "m_online"> = { CASH: "m_cash", BANK: "m_bank", TERMINAL: "m_online" };
const STATUS_LOOK: Record<Status, { tone: "neutral" | "warning" | "success"; icon: LucideIcon; key: string }> = {
  DRAFT: { tone: "neutral", icon: FilePen, key: "st_draft" },
  PENDING: { tone: "warning", icon: Clock, key: "st_pending" },
  POSTED: { tone: "success", icon: CircleCheck, key: "st_posted" },
  CANCELLED: { tone: "neutral", icon: CircleX, key: "st_cancelled" },
};

const at = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Asia/Tashkent",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(d);
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${g("day")}.${g("month")}.${g("year")}, ${g("hour")}:${g("minute")}`;
};

/** Toʻlov hujjati — toʻliq sahifa (prototip `PaymentDoc`): `/payments/mt/new`, `/payments/mt/[id]`, `/payments/yt/...`. */
export function PaymentDocPage({ kind, id }: { kind: PayKind; id: number | null }) {
  const t = useTranslations("payments.doc");
  const tp = useTranslations("payments");
  const mt = usePayment(kind === "mt" ? id : null);
  const yt = useSupplierPayment(kind === "yt" ? id : null);
  const q = kind === "mt" ? mt : yt;
  if (id != null && !q.data)
    return (
      <div className="flex flex-col gap-4">
        <DocumentHeader
          parent={{ label: tp("title"), href: "/payments" }}
          crumb={kind === "mt" ? t("mtDoc") : t("ytDoc")}
          title={kind === "mt" ? t("mtDoc") : t("ytDoc")}
        />
        {q.error ? <ErrorState onRetry={() => q.refetch()} /> : <Skeleton className="h-60 w-full" />}
      </div>
    );
  let doc: Doc | null = null;
  if (kind === "mt" && mt.data) {
    const d = mt.data;
    doc = { ...d, partyId: d.customerId, party: d.customer, partyTin: d.customerTin, status: d.status as Status };
  } else if (kind === "yt" && yt.data) {
    const d = yt.data;
    doc = { ...d, partyId: d.supplierId, party: d.supplier, partyTin: d.supplierTin, status: d.status as Status };
  }
  return <Editor key={doc ? `${doc.id}-${doc.status}-${doc.createdAt}` : "new"} kind={kind} doc={doc} />;
}

function Editor({ kind, doc }: { kind: PayKind; doc: Doc | null }) {
  const t = useTranslations("payments.doc");
  const tp = useTranslations("payments");
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = doc?.branchId ?? (me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null));
  const status: Status = doc?.status ?? "DRAFT";
  const createPerm = kind === "mt" ? PAYMENT_MT : PAYMENT_YT;
  const editable = status === "DRAFT" && can(me.data, createPerm);
  const today = todayTashkent();

  // Yangi hujjat oʻtishdan: ?customer=&customerName=&amount= (MT), ?supplier=&supplierName=&amount= (YT, kirim kartochkasidan)
  const params = useSearchParams();
  const qParty = Number(params.get(kind === "mt" ? "customer" : "supplier"));
  const init = !doc && Number.isInteger(qParty) && qParty > 0;
  const [party, setParty] = useState<string | null>(doc ? String(doc.partyId) : init ? String(qParty) : null);
  const [partyLabel, setPartyLabel] = useState(
    doc?.party ?? (init ? (params.get(kind === "mt" ? "customerName" : "supplierName") ?? "") : ""),
  );
  const labels = useRef(new Map<string, string>());
  const [date, setDate] = useState(formatIsoDate(doc?.paymentDate ?? today));
  const [amount, setAmount] = useState(doc?.amount ?? (init ? (params.get("amount") ?? "") : ""));
  const [method, setMethod] = useState<AccountKind>((doc?.accountKind as AccountKind) ?? "CASH");
  const [account, setAccount] = useState<string | null>(doc ? String(doc.accountId) : null);
  const [payOrderNo, setPayOrderNo] = useState(doc?.payOrderNo ?? "");
  const [bankDate, setBankDate] = useState(doc?.bankDate ? formatIsoDate(doc.bankDate) : formatIsoDate(today));
  const [checkNo, setCheckNo] = useState(doc?.checkNo ?? "");
  const [note, setNote] = useState(doc?.note ?? "");
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [dialog, setDialog] = useState<null | "vs" | "post" | "send" | "approve" | "cancel" | "return">(null);
  const [reason, setReason] = useState("");
  const [reasonErr, setReasonErr] = useState("");
  const [tab, setTab] = useState<"doc" | "hist">("doc");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);

  const accounts = useAccounts(branchId);
  const mtOpen = useOpenDocs(kind === "mt" ? branchId : null, party ? Number(party) : null);
  const ytOpen = useSupplierOpenDocs(kind === "yt" ? branchId : null, party ? Number(party) : null);
  const open = kind === "mt" ? mtOpen : ytOpen;
  const ledger: OpenDocs | undefined = open.data;
  const docs = useMemo(() => ledger?.docs ?? [], [ledger]);
  const cp = useCounterparty(party ? Number(party) : null);

  const all = accounts.data ?? [];
  const supervisor = can(me.data, CASH_APPROVE);
  const accountOpts = all.filter(
    (a) => a.kind === method && (String(a.id) === account || (a.active && usableAccount(a, all, me.data?.id, supervisor))),
  );
  const chosen: MoneyAccount | undefined = all.find((a) => String(a.id) === account);
  const amountStr = amount.trim();
  const effAlloc = manual ? alloc : autoAlloc(docs, amountStr || "0");

  const mark = () => setDirty(true);
  const pickMethod = (m: AccountKind) => {
    if (m === method) return;
    setMethod(m);
    const first = all.find((a) => a.kind === m && a.active && usableAccount(a, all, me.data?.id, supervisor));
    setAccount(first ? String(first.id) : null);
    mark();
  };

  const check = checkDoc({
    kind,
    party,
    date,
    amount: amountStr,
    amountInvalid: false,
    method,
    account: chosen ? { id: chosen.id, kind: chosen.kind as AccountKind, balance: chosen.balance } : null,
    payOrderNo,
    checkNo,
    today,
    docs,
    alloc: effAlloc,
    cashOnly: false,
  });
  const fieldErr = (f: Field) => {
    if (!tried) return undefined;
    const p = check.errors.find((e) => e.field === f);
    return p ? text(p) : undefined;
  };
  function text(p: Problem): string {
    const params = Object.fromEntries(Object.entries(p.params ?? {}).map(([k, v]) => [k, /^-?\d+\.\d{2}$/.test(v) ? formatMoney(v) : v]));
    return t(p.key as "eParty", params);
  }

  function body() {
    const iso = parseUzDate(date) as string;
    const refs =
      method === "BANK"
        ? { payOrderNo: payOrderNo.trim(), bankDate: parseUzDate(bankDate) ?? undefined }
        : method === "TERMINAL"
          ? { checkNo: checkNo.trim() }
          : {};
    return {
      branchId: branchId as number,
      accountId: Number(account),
      paymentDate: iso,
      amount: amountStr,
      note: note.trim() || undefined,
      ...refs,
    };
  }

  async function save(): Promise<Doc> {
    await ensureCsrf();
    const b = body();
    if (kind === "mt") {
      const r = doc
        ? await unwrap(
            api.PUT("/api/payments/customer/{id}", { params: { path: { id: doc.id } }, body: { ...b, customerId: Number(party) } }),
          )
        : await unwrap(api.POST("/api/payments/customer", { body: { ...b, customerId: Number(party) } }));
      return { ...r, partyId: r.customerId, party: r.customer, status: r.status as Status };
    }
    const r = doc
      ? await unwrap(
          api.PUT("/api/payments/supplier/{id}", { params: { path: { id: doc.id } }, body: { ...b, supplierId: Number(party) } }),
        )
      : await unwrap(api.POST("/api/payments/supplier", { body: { ...b, supplierId: Number(party) } }));
    return { ...r, partyId: r.supplierId, party: r.supplier, status: r.status as Status };
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["payments"] });
    await qc.invalidateQueries({ queryKey: ["money-accounts"] });
  }

  async function run(key: string, fn: () => Promise<void>) {
    setPending(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
      setDialog(null);
    } finally {
      setPending(null);
    }
  }

  const goto = (id: number) => router.replace(`/payments/${kind}/${id}`);

  const allocations = () =>
    manual ? docs.map((x) => ({ docType: x.docType, docId: x.docId, amount: alloc[keyOf(x)] || "0" })) : undefined;

  const onSaveDraft = () =>
    run("save", async () => {
      setTried(true);
      if (!party || !account || !parseUzDate(date) || !amountStr) {
        setDialog("vs");
        return;
      }
      const d = await save();
      await refresh();
      setDirty(false);
      toast({ tone: "success", title: t("savedDraft", { n: d.number }) });
      if (!doc) goto(d.id);
    });

  const tryPrimary = (mode: "post" | "send" | "approve") => {
    setTried(true);
    if (mode !== "approve" && check.errors.length) return setDialog("vs");
    setDialog(mode);
  };

  const doPrimary = (mode: "post" | "send" | "approve") =>
    run(mode, async () => {
      let d: Doc | null = doc;
      if (mode !== "approve") d = await save();
      if (!d) return;
      await ensureCsrf();
      if (kind === "mt") {
        await unwrap(
          api.POST("/api/payments/customer/{id}/post", { params: { path: { id: d.id } }, body: { allocations: allocations() } }),
        );
      } else if (mode === "send") {
        await unwrap(api.POST("/api/payments/supplier/{id}/send", { params: { path: { id: d.id } } }));
      } else if (mode === "approve") {
        await unwrap(
          api.POST("/api/payments/supplier/{id}/approve", { params: { path: { id: d.id } }, body: { allocations: allocations() } }),
        );
      } else {
        await unwrap(
          api.POST("/api/payments/supplier/{id}/post", { params: { path: { id: d.id } }, body: { allocations: allocations() } }),
        );
      }
      await refresh();
      setDialog(null);
      toast({ tone: "success", title: t(mode === "send" ? "tSent" : "tPosted", { n: d.number }) });
      if (!doc) goto(d.id);
    });

  const doReason = (mode: "cancel" | "return") =>
    run(mode, async () => {
      if (!doc) return;
      const r = reason.trim();
      if (r.length < 10) {
        setReasonErr(t("reasonShort"));
        return;
      }
      await ensureCsrf();
      if (kind === "mt")
        await unwrap(api.POST("/api/payments/customer/{id}/cancel", { params: { path: { id: doc.id } }, body: { reason: r } }));
      else if (mode === "cancel")
        await unwrap(api.POST("/api/payments/supplier/{id}/cancel", { params: { path: { id: doc.id } }, body: { reason: r } }));
      else await unwrap(api.POST("/api/payments/supplier/{id}/return", { params: { path: { id: doc.id } }, body: { reason: r } }));
      await refresh();
      setDialog(null);
      toast({ tone: "success", title: t(mode === "cancel" ? "tCancelled" : "tReturned", { n: doc.number }) });
    });

  // ===== Sarlavha harakatlari =====
  let primary: { label: string; icon: LucideIcon; run: () => void; key: string } | null = null;
  if (status === "DRAFT") {
    if (kind === "mt")
      primary = {
        key: "post",
        label: t("post"),
        icon: Check,
        run: () => (can(me.data, PAYMENT_MT) ? tryPrimary("post") : toast({ tone: "info", title: t("whoPostMt") })),
      };
    else if (can(me.data, PAYMENT_YT_DIRECT)) primary = { key: "post", label: t("post"), icon: Check, run: () => tryPrimary("post") };
    else
      primary = {
        key: "send",
        label: t("send"),
        icon: Send,
        run: () => (can(me.data, PAYMENT_YT) ? tryPrimary("send") : toast({ tone: "info", title: t("whoSendYt") })),
      };
  } else if (status === "PENDING")
    primary = {
      key: "approve",
      label: t("post"),
      icon: Check,
      run: () => (can(me.data, PAYMENT_YT_APPROVE) ? tryPrimary("approve") : toast({ tone: "info", title: t("whoPostYt") })),
    };
  const canCancel = doc != null && status !== "CANCELLED" && can(me.data, PAYMENT_CANCEL);
  const menu = canCancel
    ? [
        {
          key: "cancel",
          label: t("cancel"),
          icon: <Ban size={16} strokeWidth={1.5} aria-hidden />,
          onSelect: () => {
            setReason("");
            setReasonErr("");
            setDialog("cancel");
          },
        },
      ]
    : [];
  const actions = (
    <>
      {menu.length ? <RowMenu items={menu} /> : null}
      {status === "PENDING" ? (
        <Button
          variant="secondary"
          icon={Undo2}
          onClick={() => {
            if (!can(me.data, PAYMENT_YT_APPROVE)) return toast({ tone: "info", title: t("whoReturn") });
            setReason("");
            setReasonErr("");
            setDialog("return");
          }}
        >
          {t("ret")}
        </Button>
      ) : null}
      {primary ? (
        <Button icon={primary.icon} loading={pending === primary.key} onClick={primary.run}>
          {primary.label}
        </Button>
      ) : null}
    </>
  );
  const steps = docSteps(kind, status);
  const look = STATUS_LOOK[status];
  const title = doc ? (kind === "mt" ? t("mtDoc") : t("ytDoc")) : kind === "mt" ? t("mtNewT") : t("ytNewT");

  // ===== Bannerlar =====
  const banners: { tone: "warning" | "success" | "info" | "danger"; icon: LucideIcon; title: string; text?: string }[] = [];
  if (status === "PENDING" && doc)
    banners.push({ tone: "warning", icon: Clock, title: t("bPending", { who: doc.sentBy ?? "", at: at(doc.sentAt) }) });
  if (status === "DRAFT" && doc?.returnedReason)
    banners.push({ tone: "warning", icon: Undo2, title: t("bReturned", { r: doc.returnedReason }) });
  if (status === "POSTED" && doc)
    banners.push({ tone: "success", icon: CircleCheck, title: t("bPosted", { at: at(doc.postedAt), who: doc.postedBy ?? "" }) });
  if (status === "CANCELLED" && doc)
    banners.push({
      tone: "info",
      icon: CircleX,
      title: t("bCancelled", { at: at(doc.cancelledAt), who: doc.cancelledBy ?? "" }),
      text: doc.cancelReason ?? "",
    });
  const advWarn = editable ? check.warnings[0] : undefined;
  if (advWarn) banners.push({ tone: "warning", icon: PiggyBank, title: text(advWarn) });
  if (status === "POSTED" && doc?.advance && doc.advance !== "0.00")
    banners.push({ tone: "warning", icon: PiggyBank, title: t(kind === "mt" ? "wAdvMt" : "wAdvYt", { s: formatMoney(doc.advance) }) });

  const err = describeError(error);
  const rows = gridRows(docs, effAlloc);
  const fx = postEffects(ledger?.debt ?? "0", docs, effAlloc);
  const accName = chosen?.name ?? doc?.account ?? "";
  const partyName = partyLabel || doc?.party || "";

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20">
      <DocumentHeader
        parent={{ label: tp("title"), href: "/payments" }}
        crumb={doc ? doc.number : title}
        crumbMono={doc != null}
        title={title}
        number={doc?.number}
        status={
          <Badge tone={look.tone} icon={look.icon}>
            {t(look.key as "st_draft")}
          </Badge>
        }
        meta={<Steps steps={steps.map((s) => ({ ...s, label: t(STATUS_LOOK[s.status as Status].key as "st_draft") }))} />}
        actions={actions}
      />
      {banners.map((b, i) => (
        <Alert key={i} tone={b.tone} icon={b.icon} title={b.title}>
          {b.text || undefined}
        </Alert>
      ))}
      {err.message ? <Alert tone="danger" title={err.message} /> : null}

      {doc ? (
        <Tabs
          items={[
            { key: "doc", label: t("tabDoc") },
            { key: "hist", label: t("tabHist") },
          ]}
          value={tab}
          onChange={(k) => setTab(k as "doc" | "hist")}
        />
      ) : null}
      {doc && tab === "hist" ? <PaymentHistory kind={kind} id={doc.id} /> : null}
      <div className={cn("grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]", tab === "hist" && "hidden")}>
        <div className="flex min-w-0 flex-col gap-4">
          {editable ? (
            <section className="rounded-card border border-border bg-surface p-5 shadow-card">
              <h2 className="text-subtitle">{t("secPay")}</h2>
              <p className="mb-4 text-caption text-text-secondary">{t("secPayD")}</p>
              <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                <div data-f="party" className="md:col-span-2">
                  <Select
                    label={kind === "mt" ? t("hCust") : t("hSup")}
                    value={party}
                    required
                    searchable
                    loadOptions={async (q) => {
                      const found = kind === "mt" ? await searchCustomers(q) : await searchSuppliers(q);
                      found.forEach((o) => labels.current.set(o.value, o.label));
                      return found;
                    }}
                    onChange={(v) => {
                      setParty(v);
                      setPartyLabel(v ? (labels.current.get(v) ?? "") : "");
                      setAlloc({});
                      setManual(false);
                      mark();
                    }}
                    placeholder={partyLabel || t("searchPh")}
                    options={party && partyLabel ? [{ value: party, label: partyLabel }] : []}
                    error={fieldErr("party")}
                  />
                </div>
                <div data-f="date">
                  <TextField
                    label={t("hDate")}
                    value={date}
                    onChange={(v) => (setDate(v), mark())}
                    placeholder="kk.oo.yyyy"
                    inputMode="numeric"
                    maxLength={10}
                    required
                    error={fieldErr("date")}
                  />
                </div>
                <div data-f="sum" className="md:col-span-2 md:max-w-[360px]">
                  <TextField
                    label={t("hSum")}
                    variant="amount"
                    value={amount}
                    onChange={(v) => (setAmount(v), mark())}
                    suffix={t("som")}
                    required
                    error={fieldErr("sum")}
                  />
                </div>
                <div data-f="method" className="flex flex-col md:col-span-2">
                  <span className="mb-1.5 text-caption font-medium">
                    {t("hMethod")} <span className="text-danger">*</span>
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={t("hMethod")}
                    className="flex flex-wrap gap-1 rounded-control border border-border bg-table-header p-[3px]"
                  >
                    {(["CASH", "BANK", "TERMINAL"] as const).map((m) => {
                      const Icon = METHOD_ICON[m];
                      const on = method === m;
                      return (
                        <button
                          key={m}
                          type="button"
                          role="radio"
                          aria-checked={on}
                          onClick={() => pickMethod(m)}
                          className={cn(
                            "flex h-[30px] flex-[1_1_150px] items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap",
                            on
                              ? "bg-surface text-primary shadow-[0_1px_2px_rgba(18,60,58,0.10),0_0_0_1px_var(--color-primary-button)]"
                              : "text-text-secondary",
                          )}
                        >
                          <Icon size={16} strokeWidth={1.5} aria-hidden />
                          {t(METHOD_KEY[m])}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div data-f="acct" className="flex flex-col gap-1.5">
                  <Select
                    label={method === "CASH" ? t("hCash") : method === "BANK" ? t("hBank") : t("hTerm")}
                    value={account}
                    onChange={(v) => (setAccount(v), mark())}
                    required
                    placeholder={t("choose")}
                    options={accountOpts.map((a) => ({
                      value: String(a.id),
                      label: a.kind === "BANK" && a.bankName ? `${a.bankName} · ${a.accountNo ?? a.name}` : a.name,
                      sub: a.code,
                    }))}
                    error={fieldErr("acct")}
                  />
                  {chosen?.balance != null ? (
                    <span className="flex flex-wrap items-baseline gap-1.5 text-caption text-text-secondary">
                      <span>{method === "CASH" ? t("cashBal") : t("bankBal")}</span>
                      <span className="font-mono text-text-primary">{formatMoney(chosen.balance)}</span>
                    </span>
                  ) : null}
                </div>
                {method === "BANK" ? (
                  <>
                    <div data-f="payNo">
                      <TextField
                        label={t("hPayNo")}
                        value={payOrderNo}
                        onChange={(v) => (setPayOrderNo(v), mark())}
                        placeholder="0702"
                        maxLength={64}
                        required
                        className="font-mono"
                        error={fieldErr("payNo")}
                      />
                    </div>
                    <TextField
                      label={t("hBankDate")}
                      value={bankDate}
                      onChange={(v) => (setBankDate(v), mark())}
                      placeholder="kk.oo.yyyy"
                      inputMode="numeric"
                      maxLength={10}
                    />
                  </>
                ) : null}
                {method === "TERMINAL" ? (
                  <div data-f="checkNo">
                    <TextField
                      label={t("hCheck")}
                      value={checkNo}
                      onChange={(v) => (setCheckNo(v), mark())}
                      placeholder="004811"
                      maxLength={64}
                      required
                      className="font-mono"
                      error={fieldErr("checkNo")}
                    />
                  </div>
                ) : null}
                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-caption font-medium">{t("hNote")}</span>
                  <textarea
                    value={note}
                    onChange={(e) => (setNote(e.target.value), mark())}
                    rows={2}
                    maxLength={500}
                    className="resize-y rounded-control border border-border bg-surface px-3 py-[7px] text-body outline-none hover:border-border-strong focus:border-primary-button"
                  />
                </label>
              </div>
            </section>
          ) : doc ? (
            <InfoCard
              title={t("iHead")}
              rows={[
                [t("iParty"), doc.party],
                [t("iDate"), formatIsoDate(doc.paymentDate)],
                [t("iMethod"), t(METHOD_KEY[(doc.accountKind as AccountKind) ?? "CASH"] ?? "m_cash")],
                [t("iAcct"), doc.account],
                ...(doc.payOrderNo ? [[t("iPayNo"), doc.payOrderNo, true] as [string, string, boolean]] : []),
                ...(doc.bankDate ? [[t("iBankDate"), formatIsoDate(doc.bankDate)] as [string, string]] : []),
                ...(doc.checkNo ? [[t("iCheck"), doc.checkNo, true] as [string, string, boolean]] : []),
                [t("iSum"), `${formatMoney(doc.amount)} ${t("som")}`],
                ...(doc.note ? [[t("iNote"), doc.note] as [string, string]] : []),
                [t("iBy"), `${doc.createdBy} · ${at(doc.createdAt)}`],
              ]}
            />
          ) : null}

          <section data-f="alloc" className="min-w-0 rounded-card border border-border bg-surface shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider px-4 py-3">
              <span className="flex items-baseline gap-2">
                <span className="text-[14px] font-semibold">{kind === "mt" ? t("gTitle") : t("gTitleYt")}</span>
                {editable && party && docs.length ? <span className="text-[13px] text-text-secondary">{docs.length}</span> : null}
              </span>
              {editable && party && docs.length ? (
                <span className="flex flex-wrap items-center gap-3">
                  <span
                    title={manual ? t("manualTip") : undefined}
                    className={cn(
                      "inline-flex h-6 items-center gap-1.5 rounded-[6px] px-2 text-[12px] font-medium",
                      manual ? "bg-warning-bg text-warning" : "bg-table-header text-text-secondary",
                    )}
                  >
                    <Hand size={14} strokeWidth={1.5} aria-hidden />
                    {manual ? t("manual") : t("auto")}
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={WandSparkles}
                    onClick={() => {
                      setManual(false);
                      setAlloc({});
                    }}
                  >
                    {t("auto")}
                  </Button>
                </span>
              ) : null}
            </div>
            {!editable && doc ? (
              <PostedAllocations doc={doc} kind={kind} />
            ) : !party ? (
              <div className="flex items-center justify-center gap-2 px-4 py-7 text-center text-[13px] text-text-secondary">
                <ArrowUp size={16} strokeWidth={1.5} aria-hidden />
                {t("pickParty")}
              </div>
            ) : open.isLoading ? (
              <Skeleton className="m-4 h-24" />
            ) : open.error ? (
              <ErrorState onRetry={() => open.refetch()} />
            ) : docs.length === 0 ? (
              <EmptyState
                icon={Wallet}
                title={kind === "mt" ? t("noOpenT") : t("noOpenTYt")}
                description={kind === "mt" ? t("noOpenD") : t("noOpenDYt")}
              />
            ) : (
              <AllocTable
                kind={kind}
                rows={rows}
                tried={tried}
                onValue={(key, v) => {
                  const next = { ...effAlloc };
                  if (v && v !== "0.00") next[key] = v;
                  else delete next[key];
                  setAlloc(next);
                  setManual(true);
                  mark();
                }}
              />
            )}
            <Totals
              items={[
                [t("tSum"), formatMoney(editable ? amountStr || "0" : (doc?.amount ?? "0"))],
                [
                  t("tAlloc"),
                  formatMoney(
                    editable ? check.totals.allocated : (doc?.allocations ?? []).reduce((s, a) => s + Number(a.amount), 0).toFixed(2),
                  ),
                ],
              ]}
              total={[t("tAdv"), formatMoney(editable ? check.totals.advance : (doc?.advance ?? "0"))]}
            />
          </section>
        </div>

        <aside className="flex min-w-0 flex-col gap-4">
          {party ? (
            <Side kind={kind} partyId={Number(party)} partyName={partyName} ledger={ledger} cp={cp.data} branchId={branchId} />
          ) : (
            <div className="rounded-card border border-dashed border-border-strong px-4 py-5 text-center text-[13px] text-text-secondary">
              {t("pickParty")}
            </div>
          )}
        </aside>
      </div>

      {editable ? (
        <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3">
          <span className="mr-auto text-caption text-text-secondary">
            {tried && check.errors.length ? (
              <span className="inline-flex items-center gap-1.5 text-danger">
                <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
                {t("vsTitle", { n: check.errors.length })}
              </span>
            ) : dirty ? (
              tp("form.save") + "…"
            ) : null}
          </span>
          <Link href="/payments" className="text-[14px] font-medium text-primary hover:underline">
            {t("toList")}
          </Link>
          <Button variant="secondary" loading={pending === "save"} onClick={() => void onSaveDraft()}>
            {t("saveDraft")}
          </Button>
        </div>
      ) : null}

      <Modal
        open={dialog === "vs"}
        onClose={() => setDialog(null)}
        title={t("vsTitle", { n: check.errors.length })}
        tone="danger"
        primaryAction={{ label: t("close"), onClick: () => setDialog(null) }}
      >
        <p className="mb-3 text-text-secondary">{t("vsSub")}</p>
        <ul className="flex flex-col gap-1.5">
          {check.errors.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex items-start gap-2 text-left text-danger hover:underline"
                onClick={() => {
                  setDialog(null);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLElement>(`[data-f="${e.field}"]`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.querySelector<HTMLElement>("input,button,textarea")?.focus({ preventScroll: true });
                  }, 60);
                }}
              >
                <CircleAlert size={16} strokeWidth={1.5} className="mt-0.5 flex-none" aria-hidden />
                {text(e)}
              </button>
            </li>
          ))}
        </ul>
        {check.warnings.length ? (
          <>
            <p className="mt-4 mb-1.5 text-caption font-medium text-text-secondary">{t("vsWarn")}</p>
            {check.warnings.map((w, i) => (
              <p key={i} className="flex items-start gap-2 text-warning">
                <TriangleAlert size={16} strokeWidth={1.5} className="mt-0.5 flex-none" aria-hidden />
                {text(w)}
              </p>
            ))}
          </>
        ) : null}
      </Modal>

      <Modal
        open={dialog === "post" || dialog === "send" || dialog === "approve"}
        onClose={() => setDialog(null)}
        title={dialog === "send" ? t("dSendT") : t("dPostMtT")}
        primaryAction={{
          label: dialog === "send" ? t("send") : t("post"),
          loading: pending === dialog,
          onClick: () => void doPrimary(dialog as "post" | "send" | "approve"),
        }}
      >
        {dialog === "send" ? <p className="mb-3 text-text-secondary">{t("dSendNote")}</p> : null}
        <ul className="flex flex-col gap-2.5">
          <Effect icon={HandCoins}>
            {t(kind === "mt" ? "dDebtMt" : "dDebtYt", { c: partyName, a: formatMoney(fx.before), b: formatMoney(fx.after) })}
          </Effect>
          {fx.full + fx.part ? (
            <Effect icon={ReceiptText}>{t(kind === "mt" ? "dClose" : "dCloseYt", { f: fx.full, p: fx.part })}</Effect>
          ) : null}
          <Effect icon={METHOD_ICON[method]}>
            {t(kind === "mt" ? (method === "CASH" ? "dInCash" : "dIn") : method === "CASH" ? "dOutCash" : "dOut", {
              a: accName,
              s: formatMoney(amountStr || doc?.amount || "0"),
            })}
          </Effect>
          {fx.overdueClosed ? (
            <Effect icon={Clock} className="text-success">
              {t("dOdClosed", { s: formatMoney(fx.overdueClosed) })}
            </Effect>
          ) : null}
          {check.warnings.map((w, i) => (
            <Effect key={i} icon={TriangleAlert} className="text-warning">
              {text(w)}
            </Effect>
          ))}
        </ul>
      </Modal>

      <Modal
        open={dialog === "cancel" || dialog === "return"}
        onClose={() => setDialog(null)}
        title={dialog === "cancel" ? t("dCancelT", { n: doc?.number ?? "" }) : t("dReturnT")}
        tone={dialog === "cancel" ? "danger" : "default"}
        primaryAction={{
          label: dialog === "cancel" ? t("cancel") : t("ret"),
          loading: pending === dialog,
          onClick: () => void doReason(dialog as "cancel" | "return"),
        }}
      >
        {dialog === "return" ? <p className="mb-3 text-text-secondary">{t("dReturnD")}</p> : null}
        <TextField
          label={dialog === "cancel" ? t("reasonLbl") : t("returnLbl")}
          value={reason}
          onChange={(v) => (setReason(v), setReasonErr(""))}
          maxLength={300}
          error={reasonErr || undefined}
        />
      </Modal>
    </div>
  );
}

const HISTORY: Record<string, "h_create" | "h_change" | "h_send" | "h_post" | "h_return" | "h_cancel"> = {
  create: "h_create",
  update: "h_change",
  send: "h_send",
  post: "h_post",
  return: "h_return",
  cancel: "h_cancel",
};

/** «Tarix» yorligʻi (prototip `HistoryTimeline`): audit jurnalidan, kunlar boʻyicha. */
function PaymentHistory({ kind, id }: { kind: PayKind; id: number }) {
  const t = useTranslations("payments.doc");
  const q = useQuery({
    queryKey: ["payments", kind, "history", id],
    queryFn: () =>
      kind === "mt"
        ? unwrap(api.GET("/api/payments/customer/{id}/history", { params: { path: { id } } }))
        : unwrap(api.GET("/api/payments/supplier/{id}/history", { params: { path: { id } } })),
  });
  const data = q.data?.map((e) => ({ ...e, employee: e.employee ?? undefined, reason: e.reason ?? undefined }));
  return (
    <HistoryTimeline
      query={{ data, error: q.error, refetch: q.refetch }}
      label={(a) => {
        const k = HISTORY[a.split(".").pop() ?? ""];
        return k ? t(k) : a;
      }}
    />
  );
}

function Effect({ icon: Icon, className, children }: { icon: LucideIcon; className?: string; children: ReactNode }) {
  return (
    <li className={cn("flex items-start gap-2.5", className)}>
      <Icon size={16} strokeWidth={1.5} className="mt-0.5 flex-none" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/** Bosqichlar (prototip `DocumentHeader.steps`): bajarilgan — ✓, joriy — qalin, bekor — qizil. */
function Steps({ steps }: { steps: { label: string; state: "done" | "cur" | "next" | "fail" }[] }) {
  return (
    <ol className="flex flex-wrap items-center gap-1.5 text-caption">
      {steps.map((s, i) => (
        <li key={i} className="flex items-center gap-1.5">
          {i > 0 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
          <span
            className={cn(
              "inline-flex items-center gap-1",
              s.state === "done" && "text-success",
              s.state === "cur" && "font-semibold text-text-primary",
              s.state === "next" && "text-text-disabled",
              s.state === "fail" && "font-semibold text-danger",
            )}
            aria-current={s.state === "cur" ? "step" : undefined}
          >
            {s.state === "done" ? <Check size={12} strokeWidth={2} aria-hidden /> : null}
            {s.state === "fail" ? <CircleX size={12} strokeWidth={1.5} aria-hidden /> : null}
            {s.label}
          </span>
        </li>
      ))}
    </ol>
  );
}

function InfoCard({ title, rows }: { title: string; rows: ([string, string] | [string, string, boolean])[] }) {
  return (
    <section className="rounded-card border border-border bg-surface p-5 shadow-card">
      <h2 className="mb-3 text-subtitle">{title}</h2>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <dt className="text-caption text-text-secondary">{k}</dt>
            <dd className={cn("break-words", mono && "font-mono text-[13px]")}>{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function AllocTable({
  kind,
  rows,
  tried,
  onValue,
}: {
  kind: PayKind;
  rows: ReturnType<typeof gridRows>;
  tried: boolean;
  onValue: (key: string, v: string) => void;
}) {
  const t = useTranslations("payments.doc");
  const head = [
    kind === "mt" ? t("c_no") : t("c_noYt"),
    t("c_date"),
    ...(kind === "yt" ? [t("c_ext")] : []),
    t("c_due"),
    kind === "mt" ? t("c_sum") : t("c_sumYt"),
    kind === "mt" ? t("c_ret") : t("c_retYt"),
    t("c_prior"),
    t("c_left"),
    t("c_late"),
  ];
  const num = (i: number) => i >= (kind === "yt" ? 4 : 3) && i <= (kind === "yt" ? 7 : 6);
  return (
    <div className="min-w-0 overflow-x-auto">
      <table className="w-full min-w-[960px] border-collapse text-[13px] leading-[18px] tabular-nums">
        <thead>
          <tr className="h-9 border-b border-border bg-table-header text-[12px] font-medium text-text-secondary">
            {head.map((h, i) => (
              <th key={h} className={cn("px-3 font-medium whitespace-nowrap", num(i) ? "text-right" : "text-left")}>
                {h}
              </th>
            ))}
            <th className="sticky right-0 w-[180px] bg-table-header px-3 text-right font-medium shadow-[-8px_0_8px_-8px_rgba(18,60,58,0.16)]">
              {t("c_val")}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const href = r.doc.docType === "KR" ? `/receipts/${r.doc.docId}` : null;
            return (
              <tr key={r.key} className={cn("min-h-12 border-b border-divider", r.value && "bg-primary-subtle/40")}>
                <td className="px-3 py-1.5">
                  {href ? (
                    <Link href={href} className="font-mono text-[12.5px] hover:text-primary hover:underline">
                      {r.doc.docNumber}
                    </Link>
                  ) : (
                    <span className="font-mono text-[12.5px]">{r.doc.docNumber}</span>
                  )}
                </td>
                <td className="px-3 whitespace-nowrap">{formatIsoDate(r.doc.date)}</td>
                {kind === "yt" ? <td className="px-3 font-mono text-[12.5px] text-text-secondary">{r.doc.extNo ?? "—"}</td> : null}
                <td className={cn("px-3 whitespace-nowrap", r.doc.overdueDays > 0 && "text-danger")}>
                  {r.doc.dueDate ? formatIsoDate(r.doc.dueDate) : "—"}
                </td>
                <td className="px-3 text-right whitespace-nowrap">{formatMoney(r.doc.total)}</td>
                <td className="px-3 text-right whitespace-nowrap text-text-secondary">
                  {r.doc.returned === "0.00" ? "—" : formatMoney(r.doc.returned)}
                </td>
                <td className="px-3 text-right whitespace-nowrap text-text-secondary">
                  {r.doc.paid === "0.00" ? "—" : formatMoney(r.doc.paid)}
                </td>
                <td className="px-3 py-1.5 text-right whitespace-nowrap">
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="font-semibold">{formatMoney(r.doc.open)}</span>
                    {r.closes && !r.over ? (
                      <span className="inline-flex h-[18px] items-center gap-1 rounded-[6px] bg-success-bg px-1.5 text-[11.5px] font-medium text-success">
                        <CircleCheck size={12} strokeWidth={1.5} aria-hidden />
                        {t("paid")}
                      </span>
                    ) : null}
                    {r.partial ? (
                      <span className="text-[11.5px] text-text-secondary">{t("after", { s: formatMoney(r.after) })}</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-3">
                  {r.doc.overdueDays > 0 ? (
                    <span className="inline-flex h-5 items-center gap-1 rounded-[6px] bg-danger-bg px-1.5 text-[12px] font-medium whitespace-nowrap text-danger">
                      <ClockAlert size={12} strokeWidth={1.5} aria-hidden />
                      {t("days", { n: r.doc.overdueDays })}
                    </span>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
                <td className="sticky right-0 bg-surface px-3 py-2 shadow-[-8px_0_8px_-8px_rgba(18,60,58,0.16)]">
                  <TextField
                    label={`${t("c_val")} · ${r.doc.docNumber}`}
                    className="[&_label]:sr-only"
                    variant="amount"
                    size="sm"
                    value={r.value}
                    placeholder="0,00"
                    onChange={(v) => onValue(r.key, v)}
                    error={r.over && tried ? t("eRowShort") : undefined}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PostedAllocations({ doc, kind }: { doc: Doc; kind: PayKind }) {
  const t = useTranslations("payments.doc");
  if (doc.allocations.length === 0)
    return <EmptyState icon={Wallet} title={kind === "mt" ? t("noOpenT") : t("noOpenTYt")} description="" />;
  return (
    <table className="w-full border-collapse text-[13px] tabular-nums">
      <thead>
        <tr className="h-9 border-b border-border bg-table-header text-[12px] text-text-secondary">
          <th className="px-3 text-left font-medium">{kind === "mt" ? t("c_no") : t("c_noYt")}</th>
          <th className="px-3 text-right font-medium">{t("c_val")}</th>
        </tr>
      </thead>
      <tbody>
        {doc.allocations.map((a) => (
          <tr key={`${a.docType}:${a.docId}`} className="h-11 border-b border-divider">
            <td className="px-3 font-mono text-[12.5px]">
              {a.docType === "KR" ? (
                <Link href={`/receipts/${a.docId}`} className="hover:text-primary hover:underline">
                  {a.docNumber}
                </Link>
              ) : (
                a.docNumber
              )}
            </td>
            <td className="px-3 text-right font-semibold">{formatMoney(a.amount)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Totals({ items, total }: { items: [string, string][]; total: [string, string] }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-x-7 gap-y-1 rounded-b-card border-t border-border bg-table-header px-4 py-3.5 text-[13px]">
      {items.map(([k, v]) => (
        <span key={k} className="inline-flex items-baseline gap-1.5">
          <span className="text-text-secondary">{k}</span>
          <span className="tabular-nums">{v}</span>
        </span>
      ))}
      <span className="inline-flex items-baseline gap-1.5">
        <span className="text-text-secondary">{total[0]}</span>
        <span className="text-base font-semibold tabular-nums">{total[1]}</span>
      </span>
    </div>
  );
}

function Side({
  kind,
  partyId,
  partyName,
  ledger,
  cp,
  branchId,
}: {
  kind: PayKind;
  partyId: number;
  partyName: string;
  ledger: OpenDocs | undefined;
  cp: ReturnType<typeof useCounterparty>["data"];
  branchId: number | null;
}) {
  const t = useTranslations("payments.doc");
  const docs = ledger?.docs ?? [];
  const overdue = docs.filter((d) => d.overdueDays > 0).reduce((s, d) => s + Number(d.open) * 100, 0);
  const oldest = docs.reduce((m, d) => Math.max(m, d.overdueDays), 0);
  const overdueStr = (Math.round(overdue) / 100).toFixed(2);
  const terms = cp?.terms.find((x) => x.branchId === branchId);
  const today = todayTashkent();
  const license = cp?.licenses
    .filter((l) => !l.validUntil || l.validUntil >= today)
    .sort((a, b) => (b.validUntil ?? "9999").localeCompare(a.validUntil ?? "9999"))[0];
  const limit = terms?.creditLimit ? Number(terms.creditLimit) : 0;
  const debtNum = Number(ledger?.debt ?? 0);
  const pct = limit > 0 ? Math.round((debtNum / limit) * 100) : 0;
  const last = ledger?.lastPayment;
  const href = kind === "mt" ? `/customers/${partyId}` : `/suppliers/${partyId}`;
  const kpis: { label: string; value: string; note?: string; danger?: boolean }[] = [
    { label: kind === "mt" ? t("sDebt") : t("sOurDebt"), value: ledger ? formatMoney(ledger.debt) : "—" },
    {
      label: t("sOverdue"),
      value: formatMoney(overdueStr),
      note: oldest > 0 ? t("sOldest", { n: oldest }) : t("sNoOverdue"),
      danger: oldest > 0,
    },
    ...(kind === "yt" ? [{ label: t("sTerms"), value: t("sTermsV", { n: terms?.supplierPaymentDays ?? 0 }) }] : []),
    { label: kind === "mt" ? t("sAdv") : t("sAdvYt"), value: ledger ? formatMoney(ledger.advance) : "—" },
    {
      label: t("sLast"),
      value: last ? formatMoney(last.amount) : "—",
      note: last ? `${formatIsoDate(last.date)} · ${last.number}` : t("sNoLast"),
    },
  ];
  const rows: [string, string, boolean?][] =
    kind === "mt"
      ? [
          [t("sLic"), license ? t("sLicV", { no: license.number, d: formatIsoDate(license.validUntil) }) : t("sNoLic")],
          [t("sStir"), cp?.tin ?? "—", true],
        ]
      : [
          [t("sBank"), cp?.bankName ?? "—"],
          [t("sAcc"), cp?.bankAccount ?? "—", true],
          [t("sStir"), cp?.tin ?? "—", true],
        ];
  return (
    <>
      <div className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">{kind === "mt" ? t("sCust") : t("sSup")}</span>
        <Link href={href} className="text-[15px] leading-[22px] font-semibold hover:text-primary hover:underline">
          {partyName || cp?.name || ""}
        </Link>
      </div>
      <section className="rounded-card border border-border bg-surface p-4 shadow-card">
        <div className="grid grid-cols-2 gap-x-4 gap-y-4">
          {kpis.map((k) => (
            <div key={k.label} className="flex min-w-0 flex-col gap-0.5">
              <span className="text-caption text-text-secondary">{k.label}</span>
              <span className={cn("text-[20px] leading-7 font-semibold tabular-nums", k.danger && "text-danger")}>{k.value}</span>
              {k.note ? <span className="text-caption text-text-secondary">{k.note}</span> : null}
            </div>
          ))}
        </div>
        {kind === "mt" && limit > 0 ? (
          <div className="mt-4 flex flex-col gap-1.5 border-t border-divider pt-3">
            <span className="text-caption font-medium">{t("sLimit")}</span>
            <div className="flex items-baseline justify-between gap-2 text-caption">
              <span>{t("sLimitUse", { p: pct })}</span>
              <span className={cn("tabular-nums", pct > 100 && "text-danger")}>
                {formatMoney(ledger?.debt ?? "0")} / {formatMoney(terms?.creditLimit ?? "0")}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-divider">
              <div
                className={cn("h-full rounded-full", pct > 100 ? "bg-danger" : "bg-primary-button")}
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
          </div>
        ) : null}
      </section>
      <section className="flex flex-col gap-2.5 rounded-card border border-border bg-surface px-4 py-3.5 shadow-card">
        <span className="text-[14px] font-semibold">{kind === "mt" ? t("sCustCard") : t("sReq")}</span>
        {rows.map(([k, v, mono]) => (
          <div key={k} className="flex min-w-0 flex-col gap-0.5">
            <span className="text-caption text-text-secondary">{k}</span>
            <span className={cn("break-all", mono ? "font-mono text-[12.5px]" : "text-[13px]")}>{v}</span>
          </div>
        ))}
      </section>
    </>
  );
}
