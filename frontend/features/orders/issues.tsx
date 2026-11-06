"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleCheck, TriangleAlert } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/modal";
import { Radio } from "@/components/ui/selection-controls";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatDateTime } from "@/lib/format";
import { STATUS_LABELS } from "./api";

export type OrderIssueItem = components["schemas"]["OrderIssueItem"];
export type IssueReason = OrderIssueItem["reason"];

export const ISSUE_REASONS: { value: IssueReason; label: string }[] = [
  { value: "NOT_FOUND", label: "Tovar joyida yoʻq" },
  { value: "SHORTAGE", label: "Miqdor yetmaydi" },
  { value: "DAMAGED", label: "Qadoq shikastlangan" },
  { value: "WRONG_BATCH", label: "Partiya mos emas" },
  { value: "EXPIRY", label: "Yaroqlilik muddati muammosi" },
  { value: "CODE_UNREADABLE", label: "Kod oʻqilmaydi" },
  { value: "OTHER", label: "Boshqa" },
];

/** «Muammo bor» tugmasi va oynasi (SPEC 5.2): sabab tanlanadi, xabar Ombor mudiriga ketadi, taymer toʻxtamaydi. */
export function IssueButton({ orderId }: { orderId: number }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<IssueReason | null>(null);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const needNote = reason === "OTHER" && !note.trim();

  async function send() {
    if (!reason) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(
        api.POST("/api/orders/{id}/issues", { params: { path: { id: orderId } }, body: { reason, note: note.trim() || undefined } }),
      );
      toast({ tone: "success", title: "Muammo yuborildi", description: "Ombor mudiriga xabar ketdi. Taymer davom etadi." });
      setOpen(false);
      setReason(null);
      setNote("");
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  return (
    <>
      <Button variant="secondary" icon={TriangleAlert} onClick={() => setOpen(true)}>
        Muammo bor
      </Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Muammo bor"
        primaryAction={{ label: "Muammoni yuborish", onClick: () => void send(), loading: pending, disabled: !reason || needNote }}
      >
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-caption text-text-secondary">Sabab</legend>
          {ISSUE_REASONS.map((r) => (
            <Radio
              key={r.value}
              name="issue-reason"
              label={r.label}
              value={r.value}
              checked={reason === r.value}
              onChange={(v) => setReason(v as IssueReason)}
            />
          ))}
        </fieldset>
        <div className="mt-3">
          <TextField
            label={reason === "OTHER" ? "Izoh" : "Izoh (ixtiyoriy)"}
            value={note}
            onChange={setNote}
            maxLength={500}
            error={err.fields.note}
          />
        </div>
        {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
      </Modal>
    </>
  );
}

/** Ombor mudiri paneli → Muammolar: ochiq muammolar, «Hal qilindi» (izoh bilan). */
export function IssuesList({ onOpenOrder }: { onOpenOrder: (id: number) => void }) {
  const qc = useQueryClient();
  const issues = useQuery({
    queryKey: ["orders", "issues"],
    queryFn: () => unwrap(api.GET("/api/orders/issues", { params: { query: { open: true } } })),
    refetchInterval: 15_000,
  });
  const [resolving, setResolving] = useState<OrderIssueItem | null>(null);
  const [resolution, setResolution] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function resolve() {
    if (!resolving) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      await unwrap(
        api.POST("/api/orders/issues/{issueId}/resolve", {
          params: { path: { issueId: resolving.id } },
          body: { resolution: resolution.trim() },
        }),
      );
      setResolving(null);
      setResolution("");
      await qc.invalidateQueries({ queryKey: ["orders", "issues"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  if (issues.error) return <ErrorState onRetry={() => issues.refetch()} />;
  if (issues.isPending) return <Skeleton className="h-24 w-full" />;
  return (
    <>
      {issues.data.length === 0 ? (
        <Card>
          <EmptyState
            icon={CircleCheck}
            title="Ochiq muammo yoʻq"
            description="Yigʻuvchi yoki markirovkachi «Muammo bor» yuborsa, shu yerda koʻrinadi."
          />
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {issues.data.map((i) => (
            <li key={i.id} className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-border bg-surface p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="danger" icon={TriangleAlert}>
                    {i.reasonLabel}
                  </Badge>
                  <button type="button" className="font-mono text-primary-button hover:underline" onClick={() => onOpenOrder(i.orderId)}>
                    {i.orderNumber}
                  </button>
                  <span className="text-text-secondary">{STATUS_LABELS[i.stage]}</span>
                </div>
                <div className="mt-1">{i.customer}</div>
                {i.note ? <div className="mt-1">{i.note}</div> : null}
                <div className="mt-1 text-caption text-text-secondary">
                  {i.createdBy} · {formatDateTime(new Date(i.createdAt))}
                </div>
              </div>
              <Button
                size="sm"
                variant="secondary"
                icon={CircleCheck}
                onClick={() => {
                  setResolving(i);
                  setError(null);
                }}
              >
                Hal qilindi
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Modal
        open={resolving !== null}
        onClose={() => setResolving(null)}
        title="Muammo hal qilindi"
        primaryAction={{ label: "Belgilash", onClick: () => void resolve(), loading: pending, disabled: !resolution.trim() }}
      >
        <p className="mb-3">
          {resolving?.orderNumber} · {resolving?.reasonLabel}
        </p>
        <TextField label="Nima qilindi" value={resolution} onChange={setResolution} maxLength={500} error={err.fields.resolution} />
        {err.message ? <Alert tone="danger" title={err.message} className="mt-3" /> : null}
      </Modal>
    </>
  );
}
