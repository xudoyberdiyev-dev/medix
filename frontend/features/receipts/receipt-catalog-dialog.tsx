"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { ZONE_LABELS, type Zone } from "@/features/organization/api";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { type CatalogInput, type CatalogPick, collectPicks, EMPTY_INPUT } from "./receipt-catalog";
import { day } from "./receipts-page";

/**
 * Kirim uchun «Mahsulot qoʻshish» katalogi (SPEC 5.1): kod, mahsulot, ishlab chiqaruvchi, ombordagi qoldiq, shu YB dan oxirgi kirim.
 * Qatorda partiya, ishlab chiqarilgan sana, yaroqlilik, soni, aksiya bonusi va faktura narxi kiritiladi; zona — hammasiga bitta.
 * Bitta mahsulotning ikkinchi partiyasi — katalogni qayta ochib. Enter — qoʻshish va qaytish.
 */
export function ReceiptCatalogDialog({
  warehouseId,
  supplierId,
  zones,
  defaultZone,
  pricesVisible,
  existing,
  header,
  onClose,
  onAdd,
}: {
  warehouseId: number;
  supplierId: number | null;
  zones: Zone[];
  defaultZone: string | null;
  pricesVisible: boolean;
  existing: Set<string>;
  header: string;
  onClose: () => void;
  onAdd: (lines: CatalogPick[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [supplierOnly, setSupplierOnly] = useState(supplierId !== null);
  const [zone, setZone] = useState<string | null>(defaultZone ?? (zones[0] ? String(zones[0].id) : null));
  const [inputs, setInputs] = useState<Record<number, CatalogInput>>({});
  const [tried, setTried] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const catalog = useQuery({
    queryKey: ["receipts", "catalog", warehouseId, supplierId, q, supplierOnly],
    queryFn: () =>
      unwrap(
        api.GET("/api/receipts/catalog", {
          params: { query: { warehouseId, supplierId: supplierId ?? undefined, q: q || undefined, supplierOnly, size: 100 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const rows = catalog.data?.items ?? [];
  const { picks, errors } = collectPicks(rows, inputs, { zoneId: zone ? Number(zone) : null, pricesVisible, existing });
  const hasErrors = Object.keys(errors).length > 0;

  function set(id: number, field: keyof CatalogInput, value: string) {
    setInputs((m) => ({ ...m, [id]: { ...(m[id] ?? EMPTY_INPUT), [field]: value } }));
  }

  function add() {
    setTried(true);
    if (hasErrors || picks.length === 0) return;
    onAdd(picks);
  }

  const cell = (
    r: (typeof rows)[number],
    field: keyof CatalogInput,
    label: string,
    width: string,
    extra?: { numeric?: boolean; placeholder?: string },
  ) => (
    <TextField
      label={`${r.name}: ${label}`}
      size="sm"
      value={inputs[r.productId]?.[field] ?? ""}
      onChange={(x) => set(r.productId, field, x)}
      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
      inputMode={extra?.numeric ? "numeric" : undefined}
      placeholder={extra?.placeholder}
      className={`${width} [&>label]:sr-only`}
    />
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Mahsulot qoʻshish"
      primaryAction={{
        label: picks.length ? `Qoʻshish va qaytish · ${picks.length}` : "Qoʻshish va qaytish",
        disabled: picks.length === 0 && !hasErrors,
        onClick: add,
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-caption text-text-secondary">{header}</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-64 flex-1">
            <TextField
              label="Qidirish"
              variant="search"
              size="sm"
              value={search}
              autoFocus
              onChange={(v) => {
                setSearch(v);
                clearTimeout(debounce.current);
                debounce.current = setTimeout(() => setQ(v.trim()), 250);
              }}
              placeholder="Kod, shtrix-kod yoki nom"
              className="[&>label]:sr-only"
            />
          </div>
          <Select
            label="Zona (hammasiga)"
            size="sm"
            value={zone}
            onChange={setZone}
            options={zones.map((z) => ({ value: String(z.id), label: z.name, sub: ZONE_LABELS[z.type] }))}
            className="w-56"
          />
          {supplierId !== null ? <Checkbox label="Faqat shu YB mahsulotlari" checked={supplierOnly} onChange={setSupplierOnly} /> : null}
        </div>
        {catalog.error ? (
          <ErrorState onRetry={() => catalog.refetch()} />
        ) : catalog.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-auto rounded-card border border-border">
            <table className="w-full text-table">
              <thead className="sticky top-0 bg-table-header text-left text-text-secondary">
                <tr>
                  <th className="px-2 py-2 font-medium">Mahsulot</th>
                  <th className="px-2 py-2 text-right font-medium">Qoldiq</th>
                  <th className="px-2 py-2 font-medium">Oxirgi kirim</th>
                  <th className="px-2 py-2 font-medium">Partiya</th>
                  <th className="px-2 py-2 font-medium">Ishlab chiq.</th>
                  <th className="px-2 py-2 font-medium">Yaroqlilik</th>
                  <th className="px-2 py-2 text-right font-medium">Soni</th>
                  <th className="px-2 py-2 text-right font-medium">Bonus</th>
                  {pricesVisible ? <th className="px-2 py-2 text-right font-medium">Narx</th> : null}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-6 text-center text-text-secondary">
                      {supplierOnly ? "Bu YB dan hali kirim yoʻq. «Faqat shu YB mahsulotlari»ni oʻchirib koʻring." : "Mos mahsulot yoʻq."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const error = tried ? errors[r.productId] : undefined;
                    return (
                      <tr key={r.productId} className="border-t border-border align-top">
                        <td className="px-2 py-2">
                          <span className="flex flex-col">
                            <span>
                              <span className="font-mono text-text-secondary">{r.code}</span> {r.name}
                            </span>
                            {r.manufacturer ? <span className="text-caption text-text-secondary">{r.manufacturer}</span> : null}
                            {error ? <span className="text-caption text-danger">{error}</span> : null}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{formatQuantity(r.stock)}</td>
                        <td className="px-2 py-2 text-caption whitespace-nowrap text-text-secondary">
                          {r.lastDate ? day(r.lastDate) : "—"}
                          {pricesVisible && r.lastPrice ? <div className="tabular-nums">{formatMoney(r.lastPrice)}</div> : null}
                        </td>
                        <td className="px-1 py-1">{cell(r, "batch", "partiya", "w-24")}</td>
                        <td className="px-1 py-1">{cell(r, "produced", "ishlab chiqarilgan", "w-28", { placeholder: "KK.OO.YYYY" })}</td>
                        <td className="px-1 py-1">{cell(r, "expiry", "yaroqlilik", "w-28", { placeholder: "KK.OO.YYYY" })}</td>
                        <td className="px-1 py-1">{cell(r, "qty", "soni", "w-20 [&_input]:text-right", { numeric: true })}</td>
                        <td className="px-1 py-1">{cell(r, "bonus", "aksiya bonusi", "w-16 [&_input]:text-right", { numeric: true })}</td>
                        {pricesVisible ? (
                          <td className="px-1 py-1">
                            {cell(r, "price", "faktura narxi", "w-28 [&_input]:text-right", {
                              placeholder: r.lastPrice ? formatMoney(r.lastPrice) : "soʻm",
                            })}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-caption text-text-secondary">
          Toʻldirilgan qatorlar qoʻshiladi.{pricesVisible ? " Narx boʻsh boʻlsa — shu YB dan oxirgi narx." : ""} Ikkinchi partiya uchun
          katalogni qayta oching.
        </p>
      </div>
    </Modal>
  );
}
