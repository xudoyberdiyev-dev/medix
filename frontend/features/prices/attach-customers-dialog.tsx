"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useDeferredValue, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { cn } from "@/lib/cn";

export const CLIENT_TERMS = "clients.terms";

/** Belgi: hozirgi holat va dastlab (serverda) shu turga biriktirilganmi. */
export type AttachPick = { on: boolean; was: boolean };

/** Belgilashlardan oʻzgarishlar: attach — yangi belgilangan, detach — belgisi olib tashlangan. */
export function attachDiff(picked: ReadonlyMap<number, AttachPick>) {
  const attach: number[] = [];
  const detach: number[] = [];
  for (const [id, p] of picked) {
    if (p.on && !p.was) attach.push(id);
    if (!p.on && p.was) detach.push(id);
  }
  return { attach: attach.sort((a, b) => a - b), detach: detach.sort((a, b) => a - b) };
}

/**
 * «Biriktirish» (prototip `Prices` → Narx turlari → attach): shu filial shartida mijozlarning narx turi tanlangan turga oʻzgaradi;
 * belgi olib tashlansa — bazaviyga qaytadi. Qidiruv — nom yoki STIR (lotin/kirill farqsiz, serverda).
 */
export function AttachCustomersDialog({
  type,
  branchId,
  branchName,
  onClose,
}: {
  type: { id: number; name: string };
  branchId: number;
  branchName: string;
  onClose: () => void;
}) {
  const t = useTranslations("prices.attach");
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const dq = useDeferredValue(q.trim());
  const [picked, setPicked] = useState<Map<number, AttachPick>>(new Map());
  const list = useQuery({
    queryKey: ["price-type-customers", branchId, type.id, dq],
    queryFn: () =>
      unwrap(
        api.GET("/api/counterparties/price-type-customers", {
          params: { query: { branchId, priceTypeId: type.id, ...(dq ? { q: dq } : {}), limit: 200 } },
        }),
      ),
  });
  const isOn = (id: number, current: number | null | undefined) => picked.get(id)?.on ?? current === type.id;
  const save = useMutation({
    mutationFn: async () => {
      await ensureCsrf();
      const diff = attachDiff(picked);
      return unwrap(api.PUT("/api/counterparties/price-type-customers", { body: { branchId, priceTypeId: type.id, ...diff } }));
    },
    onSuccess: (r) => {
      toast({ tone: "success", title: t("done", { n: r.changed }) });
      void qc.invalidateQueries({ queryKey: ["price-types"] });
      void qc.invalidateQueries({ queryKey: ["price-type-customers"] });
      onClose();
    },
  });
  const diff = attachDiff(picked);
  const attachedCount = (list.data?.attached ?? 0) + diff.attach.length - diff.detach.length;
  const err = save.error ? describeError(save.error).message : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={t("title", { t: type.name, b: branchName })}
      primaryAction={{ label: t("save"), loading: save.isPending, onClick: () => save.mutate() }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-[13px] leading-[18px] text-text-secondary">{t("sub", { t: type.name })}</p>
        <TextField label={t("search")} variant="search" value={q} onChange={setQ} placeholder={t("search")} className="[&>label]:sr-only" />
        <div className="-mx-6 max-h-[420px] overflow-y-auto border-y border-border">
          {list.error ? (
            <ErrorState onRetry={() => list.refetch()} />
          ) : !list.data ? (
            <div className="flex flex-col gap-2 px-6 py-3">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : list.data.items.length === 0 ? (
            <p className="px-6 py-6 text-center text-text-secondary">{dq ? t("noResults") : t("empty")}</p>
          ) : (
            list.data.items.map((c) => {
              const on = isOn(c.id, c.priceTypeId);
              return (
                <div
                  key={c.id}
                  className={cn("flex min-h-12 items-center border-b border-border px-6 py-1.5 last:border-b-0", on && "bg-primary-soft")}
                >
                  <Checkbox
                    checked={on}
                    onChange={(v) => setPicked((m) => new Map(m).set(c.id, { on: v, was: c.priceTypeId === type.id }))}
                    label={c.name}
                    description={`${t("tin", { tin: c.tin })} · ${t("now", { t: c.priceType ?? t("base") })}`}
                    className="w-full"
                  />
                </div>
              );
            })
          )}
        </div>
        {list.data && list.data.total > list.data.items.length ? (
          <p className="text-caption text-text-secondary">{t("more", { n: list.data.items.length, total: list.data.total })}</p>
        ) : null}
        <p className="text-[13px] text-text-secondary">{t("count", { n: Math.max(0, attachedCount) })}</p>
        {err ? <Alert tone="danger" title={err} /> : null}
      </div>
    </Modal>
  );
}
