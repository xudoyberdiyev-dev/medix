"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { DeactivateDialog } from "@/features/organization/deactivate-dialog";
import { useAccounts } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { sumMoney } from "@/features/transfers/model";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { OPENING_APPROVE, OPENING_CREATE } from "./api";
import {
  emptyFinLine,
  finLinesFrom,
  parseSignedMoney,
  useCancelFin,
  useFinOpening,
  usePostFin,
  useSaveFin,
  type FinDetail,
  type FinDraftLine,
  type FinKind,
} from "./finance-api";
import { OpeningStatusBadge } from "./opening-page";

async function searchParties(kind: FinKind, q: string) {
  const role = kind === "CUSTOMER_DEBT" ? "CUSTOMER" : "SUPPLIER";
  const page = await unwrap(api.GET("/api/counterparties", { params: { query: { q, role, size: 20 } } }));
  return page.items.map((c) => ({ value: String(c.id), label: c.name, sub: c.tin }));
}

/** BQ — mijozlar qarzi, YB qarzi, kassa va bank: qoralama, oʻtkazish, bekor qilish (prototip `OpeningDoc`). */
export function FinanceDrawer(props: {
  id: number | null;
  kind: FinKind;
  branchId: number | null;
  branchName: string;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("opening");
  const doc = useFinOpening(props.id);
  if (props.id !== null && !doc.data) {
    return (
      <Drawer open onClose={props.onClose} size="lg" kind="BQ" title={t("drawer.loading")}>
        {doc.error ? <ErrorState onRetry={() => doc.refetch()} /> : <Skeleton className="h-40" />}
      </Drawer>
    );
  }
  return <Editor key={doc.data?.version ?? "new"} {...props} doc={doc.data ?? null} />;
}

function Editor(props: {
  doc: FinDetail | null;
  kind: FinKind;
  branchId: number | null;
  branchName: string;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("opening");
  const me = useMe();
  const { doc } = props;
  const kind = doc?.kind ?? props.kind;
  const branchId = doc?.branchId ?? props.branchId;
  const editable = (!doc || doc.status === "DRAFT") && can(me.data, OPENING_CREATE);
  const canPost = doc?.status === "DRAFT" && can(me.data, OPENING_APPROVE);
  const accounts = useAccounts(kind === "MONEY" ? branchId : null);
  const save = useSaveFin();
  const post = usePostFin();
  const cancel = useCancelFin();
  const [date, setDate] = useState(formatIsoDate(doc?.cutoffDate ?? todayTashkent()));
  const [note, setNote] = useState(doc?.note ?? "");
  const [lines, setLines] = useState<FinDraftLine[]>(() =>
    doc
      ? doc.lines.map((l) => ({
          ref: String(l.counterpartyId ?? l.accountId),
          refLabel: l.name,
          amount: formatMoney(l.amount),
          dueDate: l.dueDate ? formatIsoDate(l.dueDate) : null,
          docRef: l.docRef ?? "",
        }))
      : [emptyFinLine(), emptyFinLine(), emptyFinLine()],
  );
  const [local, setLocal] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const seen = useRef(new Map<string, string>());
  const debt = kind !== "MONEY";
  const typeName = t(`type.${kind}`);
  const err = local ?? describeError(save.error ?? post.error).message;
  const amounts = lines.map((l) => parseSignedMoney(l.amount)).filter((a): a is string => typeof a === "string");
  const total = sumMoney(amounts);

  const set = (i: number, patch: Partial<FinDraftLine>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function request() {
    setLocal(null);
    if (branchId == null) return (setLocal(t("fin.pickBranch")), null);
    const iso = parseUzDate(date);
    if (!iso) return (setLocal(t("errors.cutoffFormat")), null);
    if (iso > todayTashkent()) return (setLocal(t("errors.cutoffFuture")), null);
    const withDue = lines.map((l) => ({ ...l, dueDate: l.dueDate ? (parseUzDate(l.dueDate) ?? null) : null }));
    const r = finLinesFrom(kind, withDue);
    if (!r.ok) {
      setLocal(
        r.error.key === "needLine"
          ? t("fin.needLine", { what: debt ? t("fin.party") : t("fin.account") })
          : t("fin.badAmount", { n: r.error.n }),
      );
      return null;
    }
    return { kind, branchId, cutoffDate: iso, note: note.trim() || undefined, lines: r.lines };
  }

  function onSave(then?: (d: FinDetail) => void) {
    const body = request();
    if (!body) return;
    save.mutate(
      { id: doc?.id, body },
      {
        onSuccess: (d) => {
          if (!doc) props.onCreated(d.id);
          if (then) then(d);
          else toast({ tone: "success", title: t("fin.saved"), description: d.number });
        },
      },
    );
  }

  const actions = (
    <>
      {doc?.status === "DRAFT" && editable ? (
        <Button variant="tertiary" onClick={() => setCancelling(true)}>
          {t("fin.cancel")}
        </Button>
      ) : null}
      {editable ? (
        <Button variant={canPost ? "secondary" : "primary"} loading={save.isPending} onClick={() => onSave()}>
          {t("fin.save")}
        </Button>
      ) : null}
      {canPost && doc ? (
        <Button
          loading={post.isPending}
          onClick={() =>
            onSave(() =>
              post.mutate(doc.id, {
                onSuccess: (d) => toast({ tone: "success", title: t("fin.posted", { type: typeName }), description: d.number }),
              }),
            )
          }
        >
          {t("fin.post")}
        </Button>
      ) : null}
    </>
  );

  const accountOptions = (accounts.data ?? []).filter((a) => a.active).map((a) => ({ value: String(a.id), label: a.name, sub: a.code }));

  return (
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind={doc ? `BQ · ${typeName} · ${doc.createdBy}` : "BQ"}
      title={doc ? doc.number : t("fin.titleNew", { type: typeName })}
      subtitle={doc?.branch ?? props.branchName}
      status={doc ? <OpeningStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        {doc?.status === "POSTED" ? <Alert tone="success" title={t("fin.postedNote")} /> : null}
        {doc?.status === "CANCELLED" && doc.cancelReason ? (
          <Alert tone="info" title={t("drawer.cancelledReason", { reason: doc.cancelReason })}>
            {doc.cancelledBy}
          </Alert>
        ) : null}
        {err ? <Alert tone="danger" title={err} /> : null}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label={t("fin.branch")} value={doc?.branch ?? props.branchName} onChange={() => undefined} disabled />
          <TextField
            label={t("fin.cutoff")}
            value={date}
            onChange={setDate}
            placeholder={t("drawer.datePlaceholder")}
            disabled={!editable}
            required
          />
          <TextField label={t("fin.note")} value={note} onChange={setNote} disabled={!editable} />
        </div>
        <section className="rounded-card border border-border">
          <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-[13px] font-semibold">{t("fin.lines")}</h3>
            <span className="text-caption text-text-secondary">
              {t("fin.total")}: <span className="tabular font-semibold text-text-primary">{formatMoney(total)}</span>
            </span>
          </div>
          <div className="flex flex-col gap-3 p-4">
            {lines.map((l, i) => (
              <div
                key={i}
                className={
                  debt
                    ? "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto] items-end gap-2"
                    : "grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end gap-2"
                }
              >
                {debt ? (
                  <Select
                    label={`${i + 1}. ${t("fin.party")}`}
                    size="sm"
                    value={l.ref}
                    loadOptions={async (q) => {
                      const found = await searchParties(kind, q);
                      found.forEach((o) => seen.current.set(o.value, o.label));
                      return found;
                    }}
                    options={l.ref && l.refLabel ? [{ value: l.ref, label: l.refLabel }] : []}
                    placeholder={l.refLabel || t("fin.partyPh")}
                    onChange={(v) => set(i, { ref: v, refLabel: v ? (seen.current.get(v) ?? l.refLabel) : "" })}
                    disabled={!editable}
                  />
                ) : (
                  <Select
                    label={`${i + 1}. ${t("fin.account")}`}
                    size="sm"
                    value={l.ref}
                    options={accountOptions.length ? accountOptions : l.ref ? [{ value: l.ref, label: l.refLabel }] : []}
                    placeholder={t("fin.accountPh")}
                    onChange={(v) => set(i, { ref: v })}
                    disabled={!editable}
                  />
                )}
                <TextField
                  label={t("fin.amount")}
                  size="sm"
                  value={l.amount}
                  onChange={(v) => set(i, { amount: v })}
                  hint={debt && i === 0 ? t("fin.amountHint") : undefined}
                  disabled={!editable}
                />
                {debt ? (
                  <>
                    <TextField
                      label={t("fin.due")}
                      size="sm"
                      value={l.dueDate ?? ""}
                      onChange={(v) => set(i, { dueDate: v || null })}
                      placeholder={t("drawer.datePlaceholder")}
                      disabled={!editable}
                    />
                    <TextField
                      label={t("fin.docRef")}
                      size="sm"
                      value={l.docRef}
                      onChange={(v) => set(i, { docRef: v })}
                      disabled={!editable}
                    />
                  </>
                ) : null}
                {editable ? (
                  <Button
                    variant="icon"
                    size="sm"
                    icon={Trash2}
                    aria-label={t("fin.removeLine", { n: i + 1 })}
                    onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : [emptyFinLine()]))}
                  />
                ) : null}
              </div>
            ))}
            {editable ? (
              <div>
                <Button variant="secondary" size="sm" icon={Plus} onClick={() => setLines((ls) => [...ls, emptyFinLine()])}>
                  {t("fin.addLine")}
                </Button>
              </div>
            ) : null}
          </div>
        </section>
      </div>
      {cancelling && doc ? (
        <DeactivateDialog
          title={t("fin.cancelConfirm")}
          consequence={doc.number}
          actionLabel={t("fin.cancel")}
          pending={cancel.isPending}
          error={cancel.error}
          onClose={() => setCancelling(false)}
          onConfirm={(reason) =>
            cancel.mutate(
              { id: doc.id, reason },
              { onSuccess: () => (toast({ tone: "success", title: t("fin.cancelled"), description: doc.number }), setCancelling(false)) },
            )
          }
        />
      ) : null}
    </Drawer>
  );
}
