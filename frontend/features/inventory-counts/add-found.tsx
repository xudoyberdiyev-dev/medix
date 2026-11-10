"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useWarehouses, ZONE_LABELS, zoneLabel } from "@/features/organization/api";
import { describeError } from "@/features/setup/form-error";
import { formatDate } from "@/lib/format";
import { useInventoryBatches, useSaveCounts, type InventoryCountDetail } from "./api";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00+05:00`));

/** Sanoqda topilgan partiyani qoʻshish (hisobda 0, sanaldi — kiritilgan). */
export function AddFound({ doc, onClose }: { doc: InventoryCountDetail; onClose: () => void }) {
  const t = useTranslations("inventoryCounts");
  const warehouses = useWarehouses();
  const save = useSaveCounts();
  const [q, setQ] = useState("");
  const [batchId, setBatchId] = useState<string | null>(null);
  const [zoneId, setZoneId] = useState<string | null>(doc.zones.length === 1 ? String(doc.zones[0].id) : null);
  const [qty, setQty] = useState("");
  const [error, setError] = useState<string | null>(null);
  const hits = useInventoryBatches(doc.id, q);
  const zones = doc.zones.length ? doc.zones : ((warehouses.data ?? []).find((w) => w.id === doc.warehouseId)?.zones ?? []);

  const add = () => {
    if (!batchId) return setError(t("errors.batch"));
    if (!zoneId) return setError(t("errors.zone"));
    if (!/^\d+$/.test(qty.trim()) || Number(qty) <= 0) return setError(t("errors.positiveQty"));
    save.mutate(
      { id: doc.id, entries: [{ zoneId: Number(zoneId), batchId: Number(batchId), countedQty: Number(qty) }] },
      {
        onSuccess: () => (toast({ tone: "success", title: t("addFound.added") }), onClose()),
        onError: (e) => setError(describeError(e).message ?? t("errors.notAdded")),
      },
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={t("addFound.title")}
      primaryAction={{ label: t("addFound.add"), loading: save.isPending, onClick: add }}
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <Alert tone="danger" title={t("addFound.failed")}>
            {error}
          </Alert>
        ) : null}
        <TextField
          label={t("addFound.search")}
          value={q}
          onChange={(v) => (setQ(v), setBatchId(null))}
          placeholder={t("addFound.searchPlaceholder")}
          variant="search"
        />
        <Select
          label={t("addFound.batch")}
          value={batchId}
          onChange={setBatchId}
          disabled={(hits.data ?? []).length === 0}
          placeholder={q.trim().length < 2 ? t("addFound.searchFirst") : hits.isFetching ? t("addFound.searching") : t("addFound.notFound")}
          options={(hits.data ?? []).map((h) => ({
            value: String(h.batchId),
            label: `${h.productName} · ${h.batchNumber} · ${day(h.expiryDate)}`,
          }))}
          required
        />
        <div className="grid grid-cols-2 gap-4">
          <Select
            label={t("addFound.zone")}
            value={zoneId}
            onChange={setZoneId}
            disabled={doc.zones.length === 1}
            options={zones.map((z) => ({
              value: String(z.id),
              label: z.name === ZONE_LABELS[z.type] ? z.name : `${z.name} · ${zoneLabel(z.type)}`,
            }))}
            required
          />
          <TextField
            label={t("addFound.counted")}
            value={qty}
            onChange={setQty}
            inputMode="numeric"
            placeholder={t("addFound.qtyPlaceholder")}
            required
          />
        </div>
      </div>
    </Modal>
  );
}
