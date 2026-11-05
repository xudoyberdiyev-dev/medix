"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Ban, CircleCheck, Save } from "lucide-react";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
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
import { searchCustomers } from "@/features/orders/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import { ACCOUNT_KIND, PAYMENT_CANCEL, PAYMENT_MT, useAccounts, useOpenDocs, usePayment, type PaymentDetail } from "./api";
import { OpenDocsSection } from "./open-docs";
import { PaymentStatusBadge } from "./payments-page";

export function PaymentDrawer(props: { id: number | null; branchId: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const one = usePayment(props.id);
  if (props.id != null && one.error) {
    return (
      <Drawer open onClose={props.onClose} kind="Toʻlov" title="Toʻlov">
        <ErrorState onRetry={() => one.refetch()} />
      </Drawer>
    );
  }
  if (props.id != null && !one.data) {
    return (
      <Drawer open onClose={props.onClose} kind="Toʻlov" title="Toʻlov">
        <Skeleton className="h-40 w-full" />
      </Drawer>
    );
  }
  return <Editor key={one.data?.version ?? "new"} {...props} doc={one.data ?? null} branchId={one.data?.branchId ?? props.branchId} />;
}

function Editor(props: { doc: PaymentDetail | null; branchId: number | null; onClose: () => void; onCreated: (id: number) => void }) {
  const { doc } = props;
  const me = useMe();
  const qc = useQueryClient();
  const editable = (!doc || doc.status === "DRAFT") && can(me.data, PAYMENT_MT);
  const [customer, setCustomer] = useState<string | null>(doc ? String(doc.customerId) : null);
  const [customerLabel, setCustomerLabel] = useState(doc?.customer ?? "");
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
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");
  const accounts = useAccounts(props.branchId);
  const open = useOpenDocs(props.branchId, customer ? Number(customer) : null);
  const docs = open.data?.docs ?? [];

  function body() {
    setLocal(null);
    if (props.branchId == null) return (setLocal("Filialni tanlang."), null);
    if (!customer) return (setLocal("Mijozni tanlang."), null);
    if (!account) return (setLocal("Hisobni tanlang (kassa, Terminal yoki bank)."), null);
    const iso = parseUzDate(date);
    if (iso === null) return (setLocal("Sana notoʻgʻri. Masalan: 04.10.2026."), null);
    if (!amount) return (setLocal("Summani kiriting."), null);
    return {
      branchId: props.branchId,
      customerId: Number(customer),
      accountId: Number(account),
      paymentDate: iso,
      amount,
      note: note.trim() || undefined,
    };
  }

  async function save(): Promise<PaymentDetail | null> {
    const b = body();
    if (!b) return null;
    await ensureCsrf();
    const d = doc
      ? await unwrap(api.PUT("/api/payments/customer/{id}", { params: { path: { id: doc.id } }, body: b }))
      : await unwrap(api.POST("/api/payments/customer", { body: b }));
    await qc.invalidateQueries({ queryKey: ["payments"] });
    return d;
  }

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

  const onSave = () =>
    run("save", async () => {
      const d = await save();
      if (!d) return;
      toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
      if (!doc) props.onCreated(d.id);
    });

  const onPost = () =>
    run("post", async () => {
      const d = await save();
      if (!d) return;
      const allocations = manual
        ? docs.map((x) => ({ docType: x.docType, docId: x.docId, amount: alloc[`${x.docType}:${x.docId}`] || "0" }))
        : undefined;
      const r = await unwrap(api.POST("/api/payments/customer/{id}/post", { params: { path: { id: d.id } }, body: { allocations } }));
      await qc.invalidateQueries({ queryKey: ["payments"] });
      await qc.invalidateQueries({ queryKey: ["money-accounts"] });
      toast({
        tone: "success",
        title: "Toʻlov oʻtkazildi",
        description: `${r.number} · ${formatMoney(r.amount)} soʻm${r.advance && r.advance !== "0.00" ? ` · avans ${formatMoney(r.advance)}` : ""}`,
      });
      if (!doc) props.onCreated(r.id);
    });

  const onCancel = () =>
    run("cancel", async () => {
      if (!doc) return;
      await ensureCsrf();
      await unwrap(api.POST("/api/payments/customer/{id}/cancel", { params: { path: { id: doc.id } }, body: { reason: reason.trim() } }));
      await qc.invalidateQueries({ queryKey: ["payments"] });
      await qc.invalidateQueries({ queryKey: ["money-accounts"] });
      setCancelOpen(false);
      toast({ tone: "success", title: "Toʻlov bekor qilindi" });
    });

  const err = describeError(error);
  const canCancel = doc != null && doc.status !== "CANCELLED" && can(me.data, PAYMENT_CANCEL);
  const actions = (
    <>
      {canCancel ? (
        <Button variant="tertiary" icon={Ban} onClick={() => setCancelOpen(true)}>
          Bekor qilish
        </Button>
      ) : null}
      {editable ? (
        <>
          <Button variant="secondary" icon={Save} loading={pending === "save"} onClick={() => void onSave()}>
            Saqlash
          </Button>
          <Button icon={CircleCheck} loading={pending === "post"} onClick={() => void onPost()}>
            Oʻtkazish
          </Button>
        </>
      ) : null}
    </>
  );

  return (
    <Drawer
      open
      onClose={props.onClose}
      size="lg"
      kind="Mijozdan toʻlov"
      title={doc ? doc.number : "Yangi toʻlov"}
      subtitle={doc ? `${doc.customer}${doc.customerTin ? ` · ${doc.customerTin}` : ""}` : undefined}
      status={doc ? <PaymentStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        {doc?.status === "CANCELLED" ? (
          <Alert tone="info" title={`Bekor qilindi: ${doc.cancelReason ?? ""}`}>
            {doc.cancelledBy}
          </Alert>
        ) : null}
        {doc?.source === "DRIVER" ? <Alert tone="info" title={`Haydovchidan qabul qilingan · ${doc.sourceRef ?? ""}`} /> : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label="Mijoz"
            value={customer}
            loadOptions={async (q) => {
              const found = await searchCustomers(q);
              found.forEach((o) => labels.current.set(o.value, o.label));
              return found;
            }}
            onChange={(v) => {
              setCustomer(v);
              setCustomerLabel(v ? (labels.current.get(v) ?? "") : "");
              setAlloc({});
            }}
            placeholder={customerLabel || "Nom, STIR yoki telefon"}
            options={customer && customerLabel ? [{ value: customer, label: customerLabel }] : []}
            disabled={!editable}
            required
            className="md:col-span-2"
          />
          <Select
            label="Hisob"
            value={account}
            onChange={setAccount}
            options={(accounts.data ?? [])
              .filter(
                (a) =>
                  a.active && (String(a.id) === account || usableAccount(a, accounts.data ?? [], me.data?.id, can(me.data, CASH_APPROVE))),
              )
              .map((a) => ({ value: String(a.id), label: `${ACCOUNT_KIND[a.kind]} · ${a.name}`, sub: a.code }))}
            disabled={!editable}
            required
          />
          <TextField label="Sana" value={date} onChange={setDate} placeholder="04.10.2026" disabled={!editable} />
          <TextField label="Summa" variant="amount" value={amount} onChange={setAmount} disabled={!editable} required suffix="soʻm" />
          <TextField label="Izoh" value={note} onChange={setNote} maxLength={500} disabled={!editable} />
        </div>
        {doc && doc.status !== "DRAFT" ? (
          <Allocations doc={doc} />
        ) : customer ? (
          <OpenDocsSection
            open={open}
            manual={manual}
            setManual={setManual}
            alloc={alloc}
            setAlloc={setAlloc}
            editable={editable}
            amount={amount}
          />
        ) : null}
      </div>
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Toʻlovni bekor qilish"
        tone="danger"
        primaryAction={{ label: "Bekor qilish", onClick: () => void onCancel(), loading: pending === "cancel", disabled: !reason.trim() }}
      >
        <p className="mb-3">
          {doc?.status === "POSTED"
            ? "Mijoz qarzi va hisob qoldigʻi teskari yoziladi. Kassada pul yetmasa, bekor qilinmaydi."
            : "Qoralama bekor qilinadi."}
        </p>
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} />
      </Modal>
    </Drawer>
  );
}

export function Allocations({ doc }: { doc: Pick<PaymentDetail, "allocations" | "advance" | "createdBy" | "postedBy"> }) {
  return (
    <section aria-label="Taqsimot">
      <h2 className="mb-2 text-subtitle">Taqsimot</h2>
      {doc.allocations.length === 0 ? (
        <p className="text-text-secondary">Qarzga taqsimlanmagan.</p>
      ) : (
        <ul className="flex flex-col">
          {doc.allocations.map((a) => (
            <li key={`${a.docType}:${a.docId}`} className="flex justify-between border-t border-border py-2">
              <span className="font-mono">{a.docNumber}</span>
              <span className="font-mono">{formatMoney(a.amount)} soʻm</span>
            </li>
          ))}
        </ul>
      )}
      {doc.advance && doc.advance !== "0.00" ? (
        <p className="mt-2">
          Avans: <span className="font-mono">{formatMoney(doc.advance)}</span> soʻm
        </p>
      ) : null}
      <p className="mt-2 text-caption text-text-secondary">
        Yaratdi: {doc.createdBy}
        {doc.postedBy ? ` · Oʻtkazdi: ${doc.postedBy}` : ""}
      </p>
    </section>
  );
}
