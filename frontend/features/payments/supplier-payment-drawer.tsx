"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { Ban, CircleCheck, FilePen, Hourglass, Save, Send, Undo2 } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { CASH_APPROVE, usableAccount } from "@/features/cash/api";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import {
  PAYMENT_CANCEL,
  PAYMENT_YT,
  PAYMENT_YT_APPROVE,
  PAYMENT_YT_DIRECT,
  searchSuppliers,
  useAccounts,
  useSupplierOpenDocs,
  useSupplierPayment,
  type SupplierPaymentDetail,
  type SupplierPaymentStatus,
} from "./api";
import { OpenDocsSection } from "./open-docs";
import { Allocations } from "./payment-drawer";

export function SupplierPaymentStatusBadge({ status }: { status: SupplierPaymentStatus }) {
  const t = useTranslations("payments");
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    PENDING: { tone: "warning", icon: Hourglass },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {t(`supplierStatus.${status}`)}
    </Badge>
  );
}

export function SupplierPaymentDrawer(props: {
  id: number | null;
  branchId: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("payments.mt");
  const one = useSupplierPayment(props.id);
  if (props.id != null && one.error) {
    return (
      <Drawer open onClose={props.onClose} kind={t("payment")} title={t("payment")}>
        <ErrorState onRetry={() => one.refetch()} />
      </Drawer>
    );
  }
  if (props.id != null && !one.data) {
    return (
      <Drawer open onClose={props.onClose} kind={t("payment")} title={t("payment")}>
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  }
  return <Editor key={one.data?.version ?? "new"} {...props} doc={one.data ?? null} branchId={one.data?.branchId ?? props.branchId} />;
}

function Editor(props: {
  doc: SupplierPaymentDetail | null;
  branchId: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const t = useTranslations("payments.yt");
  const tp = useTranslations("payments");
  const { doc } = props;
  const me = useMe();
  const qc = useQueryClient();
  const status = doc?.status ?? "DRAFT";
  const editable = status === "DRAFT" && can(me.data, PAYMENT_YT);
  const approver = status === "PENDING" && can(me.data, PAYMENT_YT_APPROVE);
  const direct = status === "DRAFT" && can(me.data, PAYMENT_YT_DIRECT);
  const [supplier, setSupplier] = useState<string | null>(doc ? String(doc.supplierId) : null);
  const [supplierLabel, setSupplierLabel] = useState(doc?.supplier ?? "");
  const labels = useRef(new Map<string, string>());
  const [account, setAccount] = useState<string | null>(doc ? String(doc.accountId) : null);
  const [date, setDate] = useState(formatIsoDate(doc?.paymentDate ?? todayTashkent()));
  const [amount, setAmount] = useState(doc?.amount ?? "");
  const [note, setNote] = useState(doc?.note ?? "");
  const [manual, setManual] = useState(false);
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [local, setLocal] = useState<string | null>(null);
  const [dialog, setDialog] = useState<"cancel" | "return" | null>(null);
  const [reason, setReason] = useState("");
  const accounts = useAccounts(props.branchId);
  const open = useSupplierOpenDocs(props.branchId, supplier ? Number(supplier) : null);
  const docs = open.data?.docs ?? [];
  const chosen = (accounts.data ?? []).find((a) => String(a.id) === account);

  function body() {
    setLocal(null);
    if (props.branchId == null) return (setLocal(tp("form.selectBranch")), null);
    if (!supplier) return (setLocal(t("selectSupplier")), null);
    if (!account) return (setLocal(t("selectAccount")), null);
    const iso = parseUzDate(date);
    if (iso === null) return (setLocal(tp("form.badDate")), null);
    if (!amount) return (setLocal(tp("form.enterAmount")), null);
    return {
      branchId: props.branchId,
      supplierId: Number(supplier),
      accountId: Number(account),
      paymentDate: iso,
      amount,
      note: note.trim() || undefined,
    };
  }

  async function save(): Promise<SupplierPaymentDetail | null> {
    const b = body();
    if (!b) return null;
    await ensureCsrf();
    const d = doc
      ? await unwrap(api.PUT("/api/payments/supplier/{id}", { params: { path: { id: doc.id } }, body: b }))
      : await unwrap(api.POST("/api/payments/supplier", { body: b }));
    await qc.invalidateQueries({ queryKey: ["payments"] });
    return d;
  }

  const allocations = () =>
    manual ? docs.map((x) => ({ docType: x.docType, docId: x.docId, amount: alloc[`${x.docType}:${x.docId}`] || "0" })) : undefined;

  async function run(key: string, fn: () => Promise<void>) {
    setPending(key);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  async function refresh() {
    await qc.invalidateQueries({ queryKey: ["payments"] });
    await qc.invalidateQueries({ queryKey: ["money-accounts"] });
  }

  const onSave = () =>
    run("save", async () => {
      const d = await save();
      if (!d) return;
      toast({ tone: "success", title: tp("form.draftSaved"), description: d.number });
      if (!doc) props.onCreated(d.id);
    });

  const onSend = () =>
    run("send", async () => {
      const d = await save();
      if (!d) return;
      await unwrap(api.POST("/api/payments/supplier/{id}/send", { params: { path: { id: d.id } } }));
      await refresh();
      toast({ tone: "success", title: t("sent"), description: d.number });
      if (!doc) props.onCreated(d.id);
    });

  const onPost = (approve: boolean) =>
    run("post", async () => {
      const d = approve ? doc : await save();
      if (!d) return;
      await ensureCsrf();
      const r = approve
        ? await unwrap(
            api.POST("/api/payments/supplier/{id}/approve", { params: { path: { id: d.id } }, body: { allocations: allocations() } }),
          )
        : await unwrap(
            api.POST("/api/payments/supplier/{id}/post", { params: { path: { id: d.id } }, body: { allocations: allocations() } }),
          );
      await refresh();
      toast({
        tone: "success",
        title: tp("mt.posted"),
        description: tp("form.amountLine", { number: r.number, amount: formatMoney(r.amount) }),
      });
      if (!doc) props.onCreated(r.id);
    });

  const onDialog = () =>
    run("dialog", async () => {
      if (!doc || !dialog) return;
      await ensureCsrf();
      if (dialog === "cancel")
        await unwrap(api.POST("/api/payments/supplier/{id}/cancel", { params: { path: { id: doc.id } }, body: { reason: reason.trim() } }));
      else
        await unwrap(api.POST("/api/payments/supplier/{id}/return", { params: { path: { id: doc.id } }, body: { reason: reason.trim() } }));
      await refresh();
      setDialog(null);
      setReason("");
      toast({ tone: "success", title: dialog === "cancel" ? tp("mt.cancelled") : t("returned") });
    });

  const err = describeError(error);
  const canCancel = doc != null && status !== "CANCELLED" && can(me.data, PAYMENT_CANCEL);
  const actions = (
    <>
      {canCancel ? (
        <Button variant="tertiary" icon={Ban} onClick={() => setDialog("cancel")}>
          {tp("form.cancel")}
        </Button>
      ) : null}
      {approver ? (
        <>
          <Button variant="secondary" icon={Undo2} onClick={() => setDialog("return")}>
            {t("returnTitle")}
          </Button>
          <Button icon={CircleCheck} loading={pending === "post"} onClick={() => void onPost(true)}>
            {t("approvePost")}
          </Button>
        </>
      ) : null}
      {editable ? (
        <>
          <Button variant="tertiary" icon={Save} loading={pending === "save"} onClick={() => void onSave()}>
            {tp("form.save")}
          </Button>
          {direct ? (
            <>
              <Button variant="secondary" icon={Send} loading={pending === "send"} onClick={() => void onSend()}>
                {t("send")}
              </Button>
              <Button icon={CircleCheck} loading={pending === "post"} onClick={() => void onPost(false)}>
                {tp("form.post")}
              </Button>
            </>
          ) : (
            <Button icon={Send} loading={pending === "send"} onClick={() => void onSend()}>
              {t("send")}
            </Button>
          )}
        </>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind={t("kind")}
      title={doc ? doc.number : tp("mt.new")}
      subtitle={doc ? `${doc.supplier}${doc.supplierTin ? ` · ${doc.supplierTin}` : ""}` : undefined}
      status={doc ? <SupplierPaymentStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        {doc?.returnedReason && status === "DRAFT" ? (
          <Alert tone="warning" title={t("returnedReason", { reason: doc.returnedReason })} />
        ) : null}
        {status === "PENDING" ? (
          <Alert tone="info" title={t("pendingTitle")}>
            {t("sentBy", { name: doc?.sentBy ?? "" })}
          </Alert>
        ) : null}
        {doc?.status === "CANCELLED" ? (
          <Alert tone="info" title={tp("form.cancelledReason", { reason: doc.cancelReason ?? "" })}>
            {doc.cancelledBy}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label={t("supplier")}
            value={supplier}
            loadOptions={async (q) => {
              const found = await searchSuppliers(q);
              found.forEach((o) => labels.current.set(o.value, o.label));
              return found;
            }}
            onChange={(v) => {
              setSupplier(v);
              setSupplierLabel(v ? (labels.current.get(v) ?? "") : "");
              setAlloc({});
            }}
            placeholder={supplierLabel || t("supplierPlaceholder")}
            options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
            disabled={!editable}
            required
            className="md:col-span-2"
          />
          <Select
            label={tp("form.account")}
            value={account}
            onChange={setAccount}
            options={(accounts.data ?? [])
              .filter(
                (a) =>
                  a.active &&
                  (String(a.id) === account || usableAccount(a, accounts.data ?? [], me.data?.id, can(me.data, CASH_APPROVE))) &&
                  a.kind !== "TERMINAL",
              )
              .map((a) => ({
                value: String(a.id),
                label: `${tp(`accountKind.${a.kind}`)} · ${a.name}`,
                sub: t("balanceSub", { amount: formatMoney(a.balance) }),
              }))}
            disabled={!editable}
            required
          />
          <TextField label={tp("form.date")} value={date} onChange={setDate} placeholder="04.10.2026" disabled={!editable} />
          <TextField
            label={tp("form.amount")}
            variant="amount"
            value={amount}
            onChange={setAmount}
            disabled={!editable}
            required
            suffix={tp("currency")}
          />
          <TextField label={tp("form.note")} value={note} onChange={setNote} maxLength={500} disabled={!editable} />
        </div>
        {chosen && status !== "POSTED" && status !== "CANCELLED" ? (
          <p className="text-caption text-text-secondary">
            {t.rich("accountBalance", {
              amount: formatMoney(chosen.balance),
              num: (chunks) => <span className="font-mono">{chunks}</span>,
            })}
          </p>
        ) : null}
        {doc && (status === "POSTED" || status === "CANCELLED") ? (
          <Allocations doc={doc} />
        ) : supplier ? (
          <OpenDocsSection
            open={open}
            manual={manual}
            setManual={setManual}
            alloc={alloc}
            setAlloc={setAlloc}
            editable={editable || approver}
            amount={amount}
          />
        ) : null}
      </div>
      <Modal
        open={dialog !== null}
        onClose={() => setDialog(null)}
        title={dialog === "cancel" ? tp("mt.cancelTitle") : t("returnTitle")}
        tone={dialog === "cancel" ? "danger" : "default"}
        primaryAction={{
          label: dialog === "cancel" ? tp("form.cancel") : t("return"),
          onClick: () => void onDialog(),
          loading: pending === "dialog",
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">{dialog === "cancel" ? (status === "POSTED" ? t("cancelPosted") : t("cancelDraft")) : t("returnHint")}</p>
        <TextField label={tp("form.reason")} value={reason} onChange={setReason} maxLength={300} />
      </Modal>
    </Drawer>
  );
}
