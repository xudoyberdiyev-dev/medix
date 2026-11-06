"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageCheck, Undo2 } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatDateTime, formatQuantity } from "@/lib/format";

/** Ombor mudiri → Qaytgan tovar (SPEC 5.4): yetkazilmagan tovar sanab qabul qilinadi → Karantin; kam kelsa — muammo. */
export function ReturnsList() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["orders", "returns"],
    queryFn: () => unwrap(api.GET("/api/orders/returns")),
    refetchInterval: 30_000,
  });
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<number | null>(null);
  const [error, setError] = useState<unknown>(null);

  async function accept(id: number, expected: number) {
    setPending(id);
    setError(null);
    try {
      await ensureCsrf();
      const received = Number(counts[id] ?? "");
      await unwrap(
        api.POST("/api/orders/returns/{returnId}/accept", { params: { path: { returnId: id } }, body: { receivedQty: received } }),
      );
      toast({
        tone: received < expected ? "warning" : "success",
        title: "Qaytgan tovar Karantinga qabul qilindi",
        description: received < expected ? `Kam keldi: ${expected - received} ta — muammo yozildi` : undefined,
      });
      await qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (e) {
      setError(e);
    } finally {
      setPending(null);
    }
  }

  const err = describeError(error);
  if (list.error) return <ErrorState onRetry={() => list.refetch()} />;
  if (list.isPending) return <Skeleton className="h-24 w-full" />;
  if (list.data.length === 0)
    return (
      <Card>
        <EmptyState icon={Undo2} title="Qaytayotgan tovar yoʻq" description="Haydovchi «Yetkazilmadi» belgilasa, tovar shu yerda kutadi." />
      </Card>
    );
  return (
    <>
      {err.message ? <Alert tone="danger" title={err.message} className="mb-3" /> : null}
      <ul className="flex flex-col gap-2">
        {list.data.map((r) => (
          <li key={r.id} className="flex flex-wrap items-end justify-between gap-3 rounded-card border border-border bg-surface p-3">
            <div className="min-w-0">
              <div>
                <span className="font-mono">{r.orderNumber}</span> · {r.customer}
              </div>
              <div className="text-caption text-text-secondary">
                {r.product} · {r.batch} · kutilmoqda {formatQuantity(r.qty)} ta · {formatDateTime(new Date(r.createdAt))}
              </div>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-28">
                <TextField
                  label="Keldi"
                  value={counts[r.id] ?? ""}
                  onChange={(v) => setCounts((m) => ({ ...m, [r.id]: v.replace(/\D/g, "") }))}
                  inputMode="numeric"
                />
              </div>
              <Button
                size="md"
                variant="secondary"
                icon={PackageCheck}
                disabled={(counts[r.id] ?? "") === ""}
                loading={pending === r.id}
                onClick={() => void accept(r.id, r.qty)}
              >
                Qabul qilish
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
