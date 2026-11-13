"use client";

import { CircleCheck, FileSpreadsheet, FileText, Hourglass, Printer, Send, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DayField } from "@/components/ui/day-field";
import { Modal } from "@/components/ui/modal";
import type { PageSize } from "@/components/ui/pagination";
import { RowMenu, type RowMenuItem } from "@/components/ui/row-menu";
import { Select } from "@/components/ui/select";
import { EmptyState, ErrorState, ForbiddenState, NoResultsState } from "@/components/ui/system-states";
import { Table, type TableColumn } from "@/components/ui/table";
import { Tabs } from "@/components/ui/tabs";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { formatIsoDate, parseUzDate, todayTashkent } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatMoney } from "@/lib/format";
import {
  fileProblem,
  INVOICES_SEND,
  INVOICES_VIEW,
  invoiceCodesUrl,
  invoicePdfUrl,
  uploadInvoiceFile,
  useInvoiceTasks,
  useMarkInvoiceSent,
  waitParts,
  type InvoiceFileKind,
  type InvoiceFilter,
  type InvoiceTask,
  type InvoiceTaskStatus,
} from "./api";

export function InvoiceStatusBadge({ status }: { status: InvoiceTaskStatus }) {
  const t = useTranslations("invoices");
  return status === "SENT" ? (
    <Badge tone="success" icon={CircleCheck}>
      {t("status.SENT")}
    </Badge>
  ) : (
    <Badge tone="warning" icon={Hourglass}>
      {t("status.PENDING")}
    </Badge>
  );
}

const open = (url: string) => window.open(url, "_blank", "noopener");

/** O10d «Fakturalar» (Pul guruhi): buxgalter navbati — HF PDF, kodlar .xlsx, e-faktura/TTN fayllari, «Yuborildi». */
export function InvoicesPage() {
  const t = useTranslations("invoices");
  const me = useMe();
  const branches = useBranchList();
  const [f, setF] = useState<InvoiceFilter>({ status: "PENDING", branchId: null, from: null, to: null, q: "" });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState<PageSize>(50);
  const [sending, setSending] = useState<InvoiceTask | null>(null);
  const [now] = useState(() => Date.now());
  const list = useInvoiceTasks(f, page, size);
  const canSend = can(me.data, INVOICES_SEND);
  if (me.data && !can(me.data, INVOICES_VIEW)) return <ForbiddenState />;

  function apply(patch: Partial<InvoiceFilter>) {
    setF((x) => ({ ...x, ...patch }));
    setPage(1);
  }
  const filtered = f.q.trim() !== "" || f.from !== null || f.to !== null || f.branchId !== null;
  const d = list.data;

  const columns: TableColumn<InvoiceTask>[] = [
    {
      key: "order",
      title: t("col.order"),
      render: (x) => (
        <div className="flex flex-col">
          <span className="font-mono">{x.orderNumber}</span>
          <span className="text-caption text-text-secondary">{t(`owner.${x.codesOwner}`)}</span>
        </div>
      ),
    },
    {
      key: "invoice",
      title: t("col.invoice"),
      render: (x) =>
        x.invoiceNumber ? (
          <span className="font-mono">{x.invoiceNumber}</span>
        ) : (
          <span className="text-text-secondary">{t("noInvoice")}</span>
        ),
    },
    {
      key: "customer",
      title: t("col.customer"),
      render: (x) => (
        <div className="flex flex-col">
          <span>{x.customer}</span>
          {x.customerTin ? <span className="font-mono text-caption text-text-secondary">{x.customerTin}</span> : null}
        </div>
      ),
    },
    ...(me.data?.allBranches ? [{ key: "branch", title: t("col.branch"), render: (x: InvoiceTask) => x.branch }] : []),
    { key: "total", title: t("col.total"), align: "right", render: (x) => formatMoney(x.total) },
    { key: "vat", title: t("col.vat"), align: "right", render: (x) => (x.vat ? formatMoney(x.vat) : "—") },
    { key: "codes", title: t("col.codes"), align: "right", render: (x) => x.codes },
    {
      key: "wait",
      title: t("col.wait"),
      render: (x) => {
        const w = waitParts(x.openedAt, x.sentAt, now);
        const text = w.d > 0 ? t("waitDays", { d: w.d, h: w.h }) : t("waitFor", { h: w.h });
        return x.status === "PENDING" && w.late ? (
          <span className="font-medium text-danger" title={t("late")}>
            {text}
          </span>
        ) : (
          text
        );
      },
    },
    {
      key: "status",
      title: t("col.status"),
      render: (x) => (
        <div className="flex flex-col items-start gap-0.5">
          <InvoiceStatusBadge status={x.status} />
          {x.status === "SENT" && x.efakturaNumber ? (
            <span className="text-caption text-text-secondary">
              {t("sentInfo", {
                number: x.efakturaNumber,
                date: x.efakturaDate ? formatIsoDate(x.efakturaDate) : "",
                by: x.sentBy ?? "",
              })}
            </span>
          ) : null}
        </div>
      ),
    },
  ];

  function actions(x: InvoiceTask) {
    const items: RowMenuItem[] = [];
    if (x.invoiceNumber)
      items.push({
        key: "pdf",
        label: t("pdf"),
        icon: <Printer size={16} strokeWidth={1.5} aria-hidden />,
        onSelect: () => open(invoicePdfUrl(x.id)),
      });
    if (x.codes > 0)
      items.push({
        key: "codes",
        label: t("codesXlsx"),
        icon: <FileSpreadsheet size={16} strokeWidth={1.5} aria-hidden />,
        onSelect: () => open(invoiceCodesUrl(x.id)),
      });
    if (canSend && x.status === "PENDING")
      items.push({
        key: "sent",
        label: t("markSent"),
        icon: <Send size={16} strokeWidth={1.5} aria-hidden />,
        onSelect: () => setSending(x),
      });
    return items.length ? <RowMenu items={items} /> : null;
  }

  return (
    <>
      <div className="mb-4">
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-caption text-text-secondary">{t("subtitle")}</p>
      </div>
      <Alert tone="info" title={t("banner")} className="mb-4" />
      <Tabs
        aria-label={t("tabsAria")}
        value={f.status ?? "ALL"}
        onChange={(k) => apply({ status: k === "ALL" ? null : (k as InvoiceTaskStatus) })}
        items={[
          { key: "PENDING", label: t("status.PENDING"), count: d ? d.pending : undefined },
          { key: "SENT", label: t("status.SENT"), count: d ? d.sent : undefined },
          { key: "ALL", label: t("all") },
        ]}
      />
      {list.error ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : (
        <Table
          caption={t("title")}
          columns={columns}
          rows={d?.items ?? []}
          rowKey={(x) => String(x.id)}
          loading={list.isPending}
          toolbar={
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-80">
                <TextField
                  label={t("search")}
                  variant="search"
                  size="sm"
                  value={f.q}
                  onChange={(q) => apply({ q })}
                  placeholder={t("searchPlaceholder")}
                  className="[&>label]:sr-only"
                />
              </div>
              {me.data?.allBranches ? (
                <div className="w-56">
                  <Select
                    label={t("branch")}
                    size="sm"
                    value={f.branchId === null ? null : String(f.branchId)}
                    onChange={(v) => apply({ branchId: v ? Number(v) : null })}
                    placeholder={t("allBranches")}
                    options={(branches.data ?? []).map((b) => ({ value: String(b.id), label: b.name, sub: b.code }))}
                  />
                </div>
              ) : null}
              <DayField label={t("from")} value={f.from} invalid={t("dateInvalid")} onApply={(from) => apply({ from })} />
              <DayField label={t("to")} value={f.to} invalid={t("dateInvalid")} onApply={(to) => apply({ to })} />
            </div>
          }
          rowActions={actions}
          pagination={
            d
              ? {
                  page,
                  pageSize: size,
                  total: d.total,
                  onPageChange: setPage,
                  onPageSizeChange: (s) => (setSize(s), setPage(1)),
                }
              : undefined
          }
          emptyState={
            filtered ? (
              <NoResultsState onClearFilters={() => apply({ q: "", from: null, to: null, branchId: null })} />
            ) : (
              <EmptyState icon={FileText} title={t("emptyTitle")} description={t("emptyDescription")} />
            )
          }
        />
      )}
      {sending ? <SentDialog task={sending} onClose={() => setSending(null)} /> : null}
    </>
  );
}

function FilePick({
  label,
  kind,
  taskId,
  done,
  error,
  onDone,
}: {
  label: string;
  kind: InvoiceFileKind;
  taskId: number;
  done: string | null;
  error?: string;
  onDone: (name: string) => void;
}) {
  const t = useTranslations("invoices");
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  async function pick(file: File | undefined) {
    if (!file) return;
    const problem = fileProblem(file);
    if (problem) {
      setErr(problem === "type" ? t("fileTypeError") : t("fileSizeError"));
      return;
    }
    setErr(undefined);
    setBusy(true);
    try {
      await uploadInvoiceFile(taskId, kind, file);
      onDone(file.name);
    } catch (e) {
      setErr(describeError(e).message ?? t("fileTypeError"));
    } finally {
      setBusy(false);
      if (ref.current) ref.current.value = "";
    }
  }
  const shown = err ?? (done ? undefined : error);
  return (
    <div className="flex flex-col gap-1" data-f={kind}>
      <span className="text-label font-medium">
        {label} <span className="text-danger">*</span>
      </span>
      <div className="flex items-center gap-3">
        <Button variant="secondary" icon={Upload} loading={busy} onClick={() => ref.current?.click()}>
          {t("chooseFile")}
        </Button>
        <span className="min-w-0 truncate text-caption text-text-secondary">
          {busy ? t("uploading") : done ? t("uploaded", { name: done }) : t("fileHint")}
        </span>
      </div>
      <input
        ref={ref}
        type="file"
        accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
        className="sr-only"
        aria-label={label}
        tabIndex={-1}
        onChange={(e) => void pick(e.target.files?.[0])}
      />
      {shown ? <span className="text-caption text-danger">{shown}</span> : null}
    </div>
  );
}

function SentDialog({ task, onClose }: { task: InvoiceTask; onClose: () => void }) {
  const t = useTranslations("invoices");
  const sent = useMarkInvoiceSent();
  const [number, setNumber] = useState("");
  const [date, setDate] = useState(() => formatIsoDate(todayTashkent()));
  const [ef, setEf] = useState<string | null>(task.hasEfakturaFile ? t("docs.kind.EFAKTURA") : null);
  const [ttn, setTtn] = useState<string | null>(task.hasTtnFile ? t("docs.kind.TTN") : null);
  const [errs, setErrs] = useState<Record<string, string>>({});
  const err = describeError(sent.error);
  function submit() {
    const iso = parseUzDate(date);
    const e: Record<string, string> = {};
    if (!number.trim()) e.number = t("numberError");
    if (!iso) e.date = t("dateError");
    if (!ef) e.ef = t("efFileError");
    if (!ttn) e.ttn = t("ttnFileError");
    setErrs(e);
    if (Object.keys(e).length > 0 || !iso) return;
    sent.mutate(
      { id: task.id, efakturaNumber: number.trim(), efakturaDate: iso },
      {
        onSuccess: () => {
          toast({ tone: "success", title: t("sent"), description: `${task.orderNumber} · ${task.customer}` });
          onClose();
        },
      },
    );
  }
  return (
    <Modal open onClose={onClose} title={t("sentTitle")} primaryAction={{ label: t("markSent"), loading: sent.isPending, onClick: submit }}>
      <p className="mb-3">
        <span className="font-mono">{task.orderNumber}</span> · {task.customer} · {formatMoney(task.total)}
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label={t("efNumber")}
          required
          value={number}
          onChange={setNumber}
          maxLength={60}
          error={errs.number ?? err.fields.efakturaNumber}
        />
        <TextField
          variant="date"
          label={t("efDate")}
          required
          value={date}
          onChange={setDate}
          placeholder="kk.oo.yyyy"
          error={errs.date ?? err.fields.efakturaDate}
        />
      </div>
      <div className="mt-4 flex flex-col gap-4">
        <FilePick label={t("efFile")} kind="EFAKTURA" taskId={task.id} done={ef} error={errs.ef} onDone={setEf} />
        <FilePick label={t("ttnFile")} kind="TTN" taskId={task.id} done={ttn} error={errs.ttn} onDone={setTtn} />
      </div>
      {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
    </Modal>
  );
}
