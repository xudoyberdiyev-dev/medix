"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Radio } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { api, unwrap } from "@/lib/api/client";
import type { components } from "@/lib/api/schema";
import { formatQuantity } from "@/lib/format";
import { day } from "./orders-page";

export type PickBatch = components["schemas"]["PickBatch"];

/**
 * Tanlash mumkin boʻlgan partiyalar: FEFO zahirasidagi (yagona) partiyadan boshqa, boʻsh qoldigʻi qator miqdoriga yetadigan.
 * Server ham shu shartni tekshiradi (order.batchInsufficient).
 */
export function otherBatchOptions(batches: PickBatch[], qty: number): { batch: PickBatch; enough: boolean }[] {
  const reserved = batches.filter((b) => b.reserved > 0);
  return batches
    .filter((b) => !(reserved.length === 1 && b.batchId === reserved[0]?.batchId))
    .map((b) => ({ batch: b, enough: b.free >= qty }));
}

export function batchLabel(b: PickBatch): string {
  return `${b.number} · ${day(b.expiryDate)}`;
}

/** «Boshqa partiyadan oldim» (SPEC 5.2): yigʻuvchi qoʻlidagi partiyani tanlaydi; FEFO dan chetlashish belgilanadi, bloklanmaydi. */
export function OtherBatchModal({
  orderId,
  line,
  onPick,
  onClose,
}: {
  orderId: number;
  line: { id: number; name: string; qty: number } | null;
  onPick: (batch: PickBatch) => void;
  onClose: () => void;
}) {
  const t = useTranslations("orders");
  const [value, setValue] = useState<string | null>(null);
  const batches = useQuery({
    queryKey: ["orders", "pick-batches", orderId, line?.id],
    queryFn: () =>
      unwrap(api.GET("/api/orders/{id}/pick/lines/{lineId}/batches", { params: { path: { id: orderId, lineId: line?.id ?? 0 } } })),
    enabled: line !== null,
  });
  const options = otherBatchOptions(batches.data ?? [], line?.qty ?? 0);
  const chosen = options.find((o) => String(o.batch.batchId) === value);

  function close() {
    setValue(null);
    onClose();
  }

  return (
    <Modal
      open={line !== null}
      onClose={close}
      title={t("otherBatch.title")}
      primaryAction={{
        label: t("otherBatch.choose"),
        disabled: !chosen?.enough,
        onClick: () => {
          if (chosen) onPick(chosen.batch);
          close();
        },
      }}
    >
      <p className="mb-3">{t("otherBatch.intro", { name: line?.name ?? "", qty: formatQuantity(line?.qty ?? 0) })}</p>
      {batches.error ? (
        <ErrorState onRetry={() => batches.refetch()} />
      ) : batches.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : options.length === 0 ? (
        <Alert tone="warning" title={t("otherBatch.noneTitle")}>
          {t("otherBatch.noneHint")}
        </Alert>
      ) : (
        <div className="flex flex-col gap-2" role="radiogroup" aria-label={t("otherBatch.aria")}>
          {options.map(({ batch, enough }) => (
            <Radio
              key={batch.batchId}
              name="other-batch"
              value={String(batch.batchId)}
              checked={value === String(batch.batchId)}
              disabled={!enough}
              onChange={setValue}
              label={batchLabel(batch)}
              description={
                enough
                  ? t(batch.reserved > 0 ? "otherBatch.freeReserved" : "otherBatch.free", { qty: formatQuantity(batch.free) })
                  : t("otherBatch.freeShort", { qty: formatQuantity(batch.free) })
              }
            />
          ))}
        </div>
      )}
    </Modal>
  );
}
