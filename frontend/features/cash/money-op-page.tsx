"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Banknote,
  CircleAlert,
  CreditCard,
  FilePen,
  Info,
  Landmark,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DocumentHeader } from "@/components/ui/document-header";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { EmptyState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { useExpenseItems } from "@/features/dictionaries/api";
import { useAccounts, type MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";
import { formatMoney } from "@/lib/format";
import { useBranchStore } from "@/lib/stores/branch";
import { APPROVAL_LIMIT, CASH_APPROVE, CASH_IO, usableAccount } from "./api";
import { sumMoney } from "./list-model";
import {
  balanceAfter,
  checkOp,
  IO_KINDS,
  IO_TYPES,
  needsApproval,
  opAccountKinds,
  parseDir,
  parseIoType,
  parseKind,
  type IoType,
  type OpDir,
  type OpField,
} from "./op-doc-model";
import { refreshMoney } from "./op-dialogs";

const IO_ICON: Record<IoType, LucideIcon> = { k2b: Landmark, b2k: Banknote, k2k: ArrowLeftRight, t2b: CreditCard };
const DIR_ICON: Record<OpDir, LucideIcon> = { IN: ArrowDownLeft, OUT: ArrowUpRight };

/**
 * Yangi KO / BO / IO — toʻliq sahifa (prototip `MoneyOpDoc`): yoʻnalish yoki oʻtkazma turi, hisob(lar) qoldigʻi,
 * sana, summa, modda, izoh; oʻngda — amaldan keyingi qoldiq; kassadan katta chiqim — tasdiqqa.
 */
export function MoneyOpPage() {
  const params = useSearchParams();
  const kind = parseKind(params.get("kind"));
  const t = useTranslations("cash.doc");
  const tc = useTranslations("cash");
  const tk = useTranslations("payments.accountKind");
  const router = useRouter();
  const qc = useQueryClient();
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const branchId = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const allowed = can(me.data, "cash.view") && (kind !== "io" || can(me.data, CASH_IO));
  const accounts = useAccounts(allowed ? branchId : null);
  const items = useExpenseItems();
  const supervisor = can(me.data, CASH_APPROVE);
  const all = accounts.data ?? [];
  const usable = all.filter((a) => a.active && usableAccount(a, all, me.data?.id, supervisor));

  const [dir, setDir] = useState<OpDir>(() => parseDir(params.get("dir")));
  const [ioType, setIoType] = useState<IoType>(() => parseIoType(params.get("io")));
  const [account, setAccount] = useState<string | null>(params.get("acct"));
  const [from, setFrom] = useState<string | null>(params.get("acct"));
  const [to, setTo] = useState<string | null>(null);
  const [item, setItem] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => formatIsoDate(todayTashkent()));
  const [party, setParty] = useState("");
  const [note, setNote] = useState("");
  const [tried, setTried] = useState(false);
  const [vsOpen, setVsOpen] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  const ofKinds = (kinds: readonly string[], not?: string | null) => usable.filter((a) => kinds.includes(a.kind) && String(a.id) !== not);
  const acctOpts = ofKinds(opAccountKinds(kind));
  const [fromKind, toKind] = IO_KINDS[ioType];
  const fromOpts = ofKinds([fromKind]);
  const toOpts = ofKinds([toKind], from);
  // Tanlov roʻyxatda boʻlmasa (tur oʻzgardi) — birinchisi
  const acct = acctOpts.find((a) => String(a.id) === account) ?? acctOpts[0] ?? null;
  const src = fromOpts.find((a) => String(a.id) === from) ?? fromOpts[0] ?? null;
  const dst = toOpts.find((a) => String(a.id) === to) ?? toOpts[0] ?? null;

  const dateIso = parseUzDate(date);
  const today = todayTashkent();
  const sourceBalance = kind === "io" ? (src?.balance ?? null) : (acct?.balance ?? null);
  const check = checkOp({
    kind,
    dir,
    account: acct ? String(acct.id) : null,
    from: src ? String(src.id) : null,
    to: dst ? String(dst.id) : null,
    item,
    amount,
    date,
    dateIso: dateIso ?? null,
    today,
    sourceBalance,
  });
  const approval = needsApproval(kind, dir, amount);
  const fieldErr = (f: OpField) => {
    if (!tried) return undefined;
    const e = check.errors.find((x) => x.field === f);
    return e ? t(`e.${e.key}`) : undefined;
  };
  const itemOpts = (items.data ?? [])
    .filter((i) => i.active && i.direction === (dir === "OUT" ? "EXPENSE" : "INCOME"))
    .map((i) => ({ value: String(i.id), label: i.name }));
  const accOption = (a: MoneyAccount) => ({
    value: String(a.id),
    label: a.kind === "BANK" && a.bankName ? `${a.bankName} · ${a.accountNo ?? a.name}` : a.name,
    sub: `${tk(a.kind)} · ${a.code}`,
  });

  async function submit() {
    setTried(true);
    setError(null);
    if (check.errors.length) return setVsOpen(true);
    if (branchId == null) return;
    setPending(true);
    try {
      await ensureCsrf();
      if (kind === "io" && src && dst) {
        const r = await unwrap(
          api.POST("/api/money-transfers", {
            body: { branchId, fromAccountId: src.id, toAccountId: dst.id, amount, note: note.trim() || undefined },
          }),
        );
        toast({
          tone: "success",
          title: tc("io.saved"),
          description: tc("io.savedDescription", { number: r.number, from: r.fromAccount, to: r.toAccount, amount: formatMoney(r.amount) }),
        });
      } else if (acct && item && dateIso) {
        const r = await unwrap(
          api.POST("/api/cash-ops", {
            body: {
              branchId,
              accountId: acct.id,
              direction: dir,
              itemId: Number(item),
              amount,
              opDate: dateIso,
              party: party.trim() || undefined,
              note: note.trim() || undefined,
            },
          }),
        );
        toast({
          tone: "success",
          title: r.status === "PENDING" ? tc("op.sentForApproval") : tc(`op.saved.${dir}`),
          description: tc("amountLine", { number: r.number, amount: formatMoney(r.amount) }),
        });
      }
      await refreshMoney(qc);
      router.push("/cash");
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  if (me.data && !allowed) return <ForbiddenState description={t("forbidden")} />;
  if (!me.data || (branchId != null && accounts.isPending)) return <Skeleton className="h-96" />;

  const title = t(`title.${kind}`);
  const err = describeError(error);
  const noAccounts = kind === "io" ? fromOpts.length === 0 || toOpts.length === 0 : acctOpts.length === 0;
  const segs =
    kind === "io"
      ? IO_TYPES.map((x) => ({ key: x, label: t(`io_${x}`), icon: IO_ICON[x], on: ioType === x, pick: () => setIoType(x) }))
      : (["OUT", "IN"] as const).map((x) => ({
          key: x,
          label: tc(x === "OUT" ? "col.out" : "col.in"),
          icon: DIR_ICON[x],
          on: dir === x,
          pick: () => (setDir(x), setItem(null)),
        }));
  const sign = (k: "src" | "dst"): 1 | -1 => (kind === "io" ? (k === "src" ? -1 : 1) : dir === "IN" ? 1 : -1);
  const sideRows: { account: MoneyAccount; sign: 1 | -1 }[] =
    kind === "io"
      ? [...(src ? [{ account: src, sign: sign("src") }] : []), ...(dst ? [{ account: dst, sign: sign("dst") }] : [])]
      : acct
        ? [{ account: acct, sign: sign("src") }]
        : [];

  return (
    <div className="flex min-w-0 flex-col gap-4 pb-20">
      <DocumentHeader
        parent={{ label: tc("page.title"), href: "/cash" }}
        crumb={t("crumbNew")}
        title={title}
        status={
          <Badge tone="neutral" icon={FilePen}>
            {t("st_draft")}
          </Badge>
        }
      />
      {approval ? <Alert tone="info" icon={Info} title={t("rule", { s: formatMoney(APPROVAL_LIMIT) })} /> : null}
      {check.short && sourceBalance != null ? <Alert tone="warning" title={t("short", { s: formatMoney(sourceBalance) })} /> : null}
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      {branchId != null && noAccounts ? <Alert tone="warning" title={t("noAccounts")} /> : null}
      {branchId == null ? (
        <EmptyState icon={Banknote} title={tc("page.noBranch.title")} description={tc("page.noBranch.description")} />
      ) : (
        <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="flex min-w-0 flex-col gap-3">
            <section className="rounded-card border border-border bg-surface p-5 shadow-[0_1px_2px_rgba(18,60,58,0.04)]">
              <h2 className="text-subtitle">{kind === "io" ? t("secIo") : t("secOp")}</h2>
              <p className="mb-4 text-caption text-text-secondary">{kind === "io" ? t("secIoD") : t("secOpD")}</p>
              <div className="grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 md:grid-cols-2">
                <div data-f="type" className="flex flex-col md:col-span-2">
                  <span className="mb-1.5 text-caption font-medium">
                    {kind === "io" ? t("ioType") : t("dir")} <span className="text-danger">*</span>
                  </span>
                  <div
                    role="radiogroup"
                    aria-label={kind === "io" ? t("ioType") : t("dir")}
                    className="flex flex-wrap gap-1 rounded-control border border-border bg-table-header p-[3px]"
                  >
                    {segs.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        role="radio"
                        aria-checked={s.on}
                        onClick={s.pick}
                        className={cn(
                          "flex h-[30px] flex-[1_1_140px] items-center justify-center gap-1.5 rounded-[6px] px-2.5 text-[13px] font-medium whitespace-nowrap",
                          s.on
                            ? "bg-surface text-primary shadow-[0_1px_2px_rgba(18,60,58,0.10),0_0_0_1px_var(--color-primary-button)]"
                            : "text-text-secondary",
                        )}
                      >
                        <s.icon size={16} strokeWidth={1.5} aria-hidden />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
                {kind === "io" ? (
                  <>
                    <AccountField
                      field="from"
                      label={t("hFrom")}
                      balanceLabel={t("bal")}
                      value={src}
                      options={fromOpts.map(accOption)}
                      onChange={setFrom}
                      error={fieldErr("from")}
                      placeholder={tc("choose")}
                    />
                    <AccountField
                      field="to"
                      label={t("hTo")}
                      balanceLabel={t("bal")}
                      value={dst}
                      options={toOpts.map(accOption)}
                      onChange={setTo}
                      error={fieldErr("to")}
                      placeholder={tc("choose")}
                    />
                  </>
                ) : (
                  <AccountField
                    field="acct"
                    label={kind === "ko" ? t("hCash") : t("hBank")}
                    balanceLabel={t("bal")}
                    value={acct}
                    options={acctOpts.map(accOption)}
                    onChange={setAccount}
                    error={fieldErr("acct")}
                    placeholder={tc("choose")}
                  />
                )}
                {kind !== "io" ? (
                  <div data-f="date" className="md:col-start-1">
                    <TextField
                      label={t("hDate")}
                      value={date}
                      onChange={setDate}
                      placeholder="kk.oo.yyyy"
                      inputMode="numeric"
                      maxLength={10}
                      required
                      error={fieldErr("date")}
                    />
                  </div>
                ) : null}
                <div data-f="sum">
                  <TextField
                    label={t("hSum")}
                    variant="amount"
                    value={amount}
                    onChange={setAmount}
                    suffix={tc("currency")}
                    required
                    error={fieldErr("sum")}
                  />
                </div>
                {kind !== "io" ? (
                  <>
                    <div data-f="item">
                      <Select
                        label={tc(`op.item.${dir}`)}
                        value={item}
                        onChange={setItem}
                        options={itemOpts}
                        required
                        placeholder={items.isPending ? tc("loading") : tc("choose")}
                        error={fieldErr("item")}
                      />
                    </div>
                    <TextField label={tc(`op.party.${dir}`)} value={party} onChange={setParty} maxLength={200} />
                  </>
                ) : null}
                <label className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-caption font-medium">{t("hNote")}</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    maxLength={500}
                    className="min-h-[56px] resize-y rounded-control border border-border bg-surface px-3 py-2 text-body outline-none hover:border-border-strong focus:border-primary focus:shadow-[0_0_0_3px_var(--color-focus-ring)]"
                  />
                </label>
              </div>
            </section>
            {kind !== "io" ? (
              <Link
                href="/payments/mt/new"
                className="inline-flex items-center gap-1.5 self-start text-caption text-text-secondary hover:text-primary hover:underline"
              >
                <Info size={14} strokeWidth={1.5} aria-hidden />
                {t("useMt")}
              </Link>
            ) : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            <span className="text-caption text-text-secondary">{t("sideT")}</span>
            {sideRows.map((r) => (
              <div
                key={r.account.id}
                className="flex flex-col gap-2 rounded-card border border-border bg-surface px-4 py-3 shadow-[0_1px_2px_rgba(18,60,58,0.04)]"
              >
                <span className="text-caption text-text-secondary">{r.account.name}</span>
                <span className="font-mono text-[20px] leading-7 font-semibold tabular-nums">{formatMoney(r.account.balance)}</span>
                <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-caption">
                  <span className="text-text-secondary">{t("after")}</span>
                  <span
                    className={cn(
                      "font-mono font-medium tabular-nums",
                      balanceAfter(r.account.balance, amount, r.sign).startsWith("-") && "text-danger",
                    )}
                  >
                    {formatMoney(balanceAfter(r.account.balance, amount, r.sign))}
                  </span>
                </div>
              </div>
            ))}
            {kind === "io" ? (
              <span className="text-caption text-text-secondary">
                {t("totalNote", { s: formatMoney(sumMoney(all.map((a) => a.balance))) })}
              </span>
            ) : null}
            {kind === "ko" ? (
              <span className="text-caption text-text-secondary">{t("rule", { s: formatMoney(APPROVAL_LIMIT) })}</span>
            ) : null}
          </aside>
        </div>
      )}

      <div className="sticky bottom-0 z-10 -mx-6 -mb-6 flex flex-wrap items-center justify-end gap-3 border-t border-border bg-surface px-6 py-3">
        <span className="mr-auto text-caption">
          {tried && check.errors.length ? (
            <span className="inline-flex items-center gap-1.5 text-danger">
              <CircleAlert size={14} strokeWidth={1.5} aria-hidden />
              {t("vsTitle", { n: check.errors.length })}
            </span>
          ) : null}
        </span>
        <Link href="/cash" className="text-[14px] font-medium text-primary hover:underline">
          {t("back")}
        </Link>
        <Button loading={pending} disabled={branchId == null || noAccounts} onClick={() => void submit()}>
          {approval ? t("send") : t("post")}
        </Button>
      </div>

      <Modal
        open={vsOpen}
        onClose={() => setVsOpen(false)}
        title={t("vsTitle", { n: check.errors.length })}
        tone="danger"
        primaryAction={{ label: t("close"), onClick: () => setVsOpen(false) }}
      >
        <p className="mb-3 text-text-secondary">{t("vsSub")}</p>
        <ul className="flex flex-col gap-1.5">
          {check.errors.map((e, i) => (
            <li key={i}>
              <button
                type="button"
                className="flex items-start gap-2 text-left text-danger hover:underline"
                onClick={() => {
                  setVsOpen(false);
                  setTimeout(() => {
                    const el = document.querySelector<HTMLElement>(`[data-f="${e.field}"]`);
                    el?.scrollIntoView({ behavior: "smooth", block: "center" });
                    el?.querySelector<HTMLElement>("input,button,textarea")?.focus({ preventScroll: true });
                  }, 60);
                }}
              >
                <CircleAlert size={16} strokeWidth={1.5} aria-hidden className="mt-0.5 shrink-0" />
                {t(`e.${e.key}`)}
              </button>
            </li>
          ))}
        </ul>
      </Modal>
    </div>
  );
}

function AccountField(props: {
  field: OpField;
  label: string;
  balanceLabel: string;
  value: MoneyAccount | null;
  options: { value: string; label: string; sub?: string }[];
  onChange: (v: string | null) => void;
  error?: string;
  placeholder: string;
}) {
  return (
    <div data-f={props.field} className="flex flex-col gap-1.5">
      <Select
        label={props.label}
        value={props.value ? String(props.value.id) : null}
        onChange={props.onChange}
        options={props.options}
        required
        placeholder={props.placeholder}
        error={props.error}
      />
      {props.value ? (
        <span className="text-caption text-text-secondary">
          {props.balanceLabel}
          <span className="font-mono tabular-nums">{formatMoney(props.value.balance)}</span>
        </span>
      ) : null}
    </div>
  );
}
