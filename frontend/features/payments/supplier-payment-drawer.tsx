"use client";

import { useQueryClient } from "@tanstack/react-query";
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
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";
import {
  ACCOUNT_KIND,
  PAYMENT_CANCEL,
  PAYMENT_YT,
  PAYMENT_YT_APPROVE,
  PAYMENT_YT_DIRECT,
  SUPPLIER_PAYMENT_STATUS,
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
  const map = {
    DRAFT: { tone: "neutral", icon: FilePen },
    PENDING: { tone: "warning", icon: Hourglass },
    POSTED: { tone: "success", icon: CircleCheck },
    CANCELLED: { tone: "neutral", icon: Ban },
  } as const;
  return (
    <Badge tone={map[status].tone} icon={map[status].icon}>
      {SUPPLIER_PAYMENT_STATUS[status]}
    </Badge>
  );
}

export function SupplierPaymentDrawer(props: {
  id: number | null;
  branchId: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const one = useSupplierPayment(props.id);
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

function Editor(props: {
  doc: SupplierPaymentDetail | null;
  branchId: number | null;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
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
    if (props.branchId == null) return (setLocal("Filialni tanlang."), null);
    if (!supplier) return (setLocal("Yetkazib beruvchini tanlang."), null);
    if (!account) return (setLocal("Hisobni tanlang (kassa yoki bank)."), null);
    const iso = parseUzDate(date);
    if (iso === null) return (setLocal("Sana notoʻgʻri. Masalan: 04.10.2026."), null);
    if (!amount) return (setLocal("Summani kiriting."), null);
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
      toast({ tone: "success", title: "Qoralama saqlandi", description: d.number });
      if (!doc) props.onCreated(d.id);
    });

  const onSend = () =>
    run("send", async () => {
      const d = await save();
      if (!d) return;
      await unwrap(api.POST("/api/payments/supplier/{id}/send", { params: { path: { id: d.id } } }));
      await refresh();
      toast({ tone: "success", title: "Tasdiqqa yuborildi", description: d.number });
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
      toast({ tone: "success", title: "Toʻlov oʻtkazildi", description: `${r.number} · ${formatMoney(r.amount)} soʻm` });
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
      toast({ tone: "success", title: dialog === "cancel" ? "Toʻlov bekor qilindi" : "Qoralamaga qaytarildi" });
    });

  const err = describeError(error);
  const canCancel = doc != null && status !== "CANCELLED" && can(me.data, PAYMENT_CANCEL);
  const actions = (
    <>
      {canCancel ? (
        <Button variant="tertiary" icon={Ban} onClick={() => setDialog("cancel")}>
          Bekor qilish
        </Button>
      ) : null}
      {approver ? (
        <>
          <Button variant="secondary" icon={Undo2} onClick={() => setDialog("return")}>
            Qoralamaga qaytarish
          </Button>
          <Button icon={CircleCheck} loading={pending === "post"} onClick={() => void onPost(true)}>
            Tasdiqlash va oʻtkazish
          </Button>
        </>
      ) : null}
      {editable ? (
        <>
          <Button variant="tertiary" icon={Save} loading={pending === "save"} onClick={() => void onSave()}>
            Saqlash
          </Button>
          {direct ? (
            <>
              <Button variant="secondary" icon={Send} loading={pending === "send"} onClick={() => void onSend()}>
                Tasdiqqa yuborish
              </Button>
              <Button icon={CircleCheck} loading={pending === "post"} onClick={() => void onPost(false)}>
                Oʻtkazish
              </Button>
            </>
          ) : (
            <Button icon={Send} loading={pending === "send"} onClick={() => void onSend()}>
              Tasdiqqa yuborish
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
      kind="Yetkazib beruvchiga toʻlov"
      title={doc ? doc.number : "Yangi toʻlov"}
      subtitle={doc ? `${doc.supplier}${doc.supplierTin ? ` · ${doc.supplierTin}` : ""}` : undefined}
      status={doc ? <SupplierPaymentStatusBadge status={doc.status} /> : undefined}
      actions={actions}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        {local ? <Alert tone="warning" title={local} /> : null}
        {doc?.returnedReason && status === "DRAFT" ? <Alert tone="warning" title={`Qaytarildi: ${doc.returnedReason}`} /> : null}
        {status === "PENDING" ? (
          <Alert tone="info" title="Tasdiqlashda — Filial rahbari yoki Direktor tasdiqlaydi">
            Yubordi: {doc?.sentBy ?? ""}
          </Alert>
        ) : null}
        {doc?.status === "CANCELLED" ? (
          <Alert tone="info" title={`Bekor qilindi: ${doc.cancelReason ?? ""}`}>
            {doc.cancelledBy}
          </Alert>
        ) : null}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Select
            label="Yetkazib beruvchi"
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
            placeholder={supplierLabel || "Nom yoki STIR"}
            options={supplier && supplierLabel ? [{ value: supplier, label: supplierLabel }] : []}
            disabled={!editable}
            required
            className="md:col-span-2"
          />
          <Select
            label="Hisob"
            value={account}
            onChange={setAccount}
            options={(accounts.data ?? [])
              .filter((a) => a.active && a.kind !== "TERMINAL")
              .map((a) => ({ value: String(a.id), label: `${ACCOUNT_KIND[a.kind]} · ${a.name}`, sub: `qoldiq ${formatMoney(a.balance)}` }))}
            disabled={!editable}
            required
          />
          <TextField label="Sana" value={date} onChange={setDate} placeholder="04.10.2026" disabled={!editable} />
          <TextField label="Summa" variant="amount" value={amount} onChange={setAmount} disabled={!editable} required suffix="soʻm" />
          <TextField label="Izoh" value={note} onChange={setNote} maxLength={500} disabled={!editable} />
        </div>
        {chosen && status !== "POSTED" && status !== "CANCELLED" ? (
          <p className="text-caption text-text-secondary">
            Hisob qoldigʻi: <span className="font-mono">{formatMoney(chosen.balance)}</span> soʻm
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
        title={dialog === "cancel" ? "Toʻlovni bekor qilish" : "Qoralamaga qaytarish"}
        tone={dialog === "cancel" ? "danger" : "default"}
        primaryAction={{
          label: dialog === "cancel" ? "Bekor qilish" : "Qaytarish",
          onClick: () => void onDialog(),
          loading: pending === "dialog",
          disabled: !reason.trim(),
        }}
      >
        <p className="mb-3">
          {dialog === "cancel"
            ? status === "POSTED"
              ? "YB oldidagi qarz va hisob qoldigʻi teskari yoziladi (pul hisobga qaytadi)."
              : "Toʻlov bekor qilinadi."
            : "Toʻlov qoralamaga qaytadi — tayyorlovchi sababni koʻradi."}
        </p>
        <TextField label="Sabab" value={reason} onChange={setReason} maxLength={300} />
      </Modal>
    </Drawer>
  );
}
