"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { Checkbox } from "@/components/ui/selection-controls";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { day } from "./orders-page";

export interface PickedLine {
  productId: number;
  productCode: string;
  productName: string;
  qty: string;
}

/**
 * «Mahsulot qoʻshish» katalogi (SPEC 5.3): kod, mahsulot, ishlab chiqaruvchi, mavjud qoldiq, narx (QQS bilan), eng yaqin muddat,
 * min/max va miqdor. «Faqat bor mahsulotlar» standart yoqilgan. Enter — qoʻshish va qaytish.
 */
export function CatalogDialog({
  warehouseId,
  customerId,
  header,
  onClose,
  onAdd,
}: {
  warehouseId: number;
  customerId: number | null;
  header: string;
  onClose: () => void;
  onAdd: (lines: PickedLine[]) => void;
}) {
  const [search, setSearch] = useState("");
  const [q, setQ] = useState("");
  const [inStockOnly, setInStockOnly] = useState(true);
  const [qty, setQty] = useState<Record<number, string>>({});
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const catalog = useQuery({
    queryKey: ["orders", "catalog", warehouseId, customerId, q, inStockOnly],
    queryFn: () =>
      unwrap(
        api.GET("/api/orders/catalog", {
          params: { query: { warehouseId, customerId: customerId ?? undefined, q: q || undefined, inStockOnly, size: 100 } },
        }),
      ),
    placeholderData: keepPreviousData,
  });
  const rows = catalog.data?.items ?? [];
  const picked = rows.filter((r) => /^\d+$/.test(qty[r.productId] ?? "") && Number(qty[r.productId]) > 0);

  function add() {
    onAdd(picked.map((r) => ({ productId: r.productId, productCode: r.code, productName: r.name, qty: qty[r.productId] })));
  }

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title="Mahsulot qoʻshish"
      primaryAction={{
        label: picked.length ? `Qoʻshish va qaytish · ${picked.length}` : "Qoʻshish va qaytish",
        disabled: !picked.length,
        onClick: add,
      }}
    >
      <div className="flex flex-col gap-3">
        <p className="text-caption text-text-secondary">{header}</p>
        <div className="flex items-center gap-3">
          <div className="flex-1">
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
          <Checkbox label="Faqat bor mahsulotlar" checked={inStockOnly} onChange={setInStockOnly} />
        </div>
        {catalog.error ? (
          <ErrorState onRetry={() => catalog.refetch()} />
        ) : catalog.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="max-h-[60vh] overflow-y-auto rounded-card border border-border">
            <table className="w-full text-table">
              <thead className="sticky top-0 bg-table-header text-left text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Kod</th>
                  <th className="px-3 py-2 font-medium">Mahsulot</th>
                  <th className="px-3 py-2 text-right font-medium">Mavjud</th>
                  <th className="px-3 py-2 text-right font-medium">Narx</th>
                  <th className="px-3 py-2 font-medium">Eng yaqin muddat</th>
                  <th className="px-3 py-2 text-right font-medium">Min / max</th>
                  <th className="px-3 py-2 text-right font-medium">Miqdor</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-6 text-center text-text-secondary">
                      {inStockOnly ? "Mos mahsulot yoʻq. «Faqat bor mahsulotlar»ni oʻchirib koʻring." : "Mos mahsulot yoʻq."}
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => {
                    const v = qty[r.productId] ?? "";
                    const n = Number(v);
                    const over = /^\d+$/.test(v) && n > r.available;
                    return (
                      <tr key={r.productId} className="border-t border-border">
                        <td className="px-3 py-2 font-mono text-text-secondary">{r.code}</td>
                        <td className="px-3 py-2">
                          <span className="flex flex-col">
                            <span>
                              {r.name}
                              {r.controlled ? (
                                <Badge tone="warning" className="ml-2">
                                  Nazoratdagi
                                </Badge>
                              ) : null}
                            </span>
                            {r.manufacturer ? <span className="text-caption text-text-secondary">{r.manufacturer}</span> : null}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatQuantity(r.available)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.price ? formatMoney(r.price) : <span className="text-text-disabled">narx yoʻq</span>}
                        </td>
                        <td className="px-3 py-2 tabular-nums">{r.nearestExpiry ? day(r.nearestExpiry) : "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                          {r.minQty ?? "—"} / {r.maxQty ?? "—"}
                        </td>
                        <td className="px-3 py-1 text-right">
                          <TextField
                            label={`${r.name} miqdori`}
                            size="sm"
                            value={v}
                            onChange={(x) => setQty((m) => ({ ...m, [r.productId]: x }))}
                            onKeyDown={(e) => e.key === "Enter" && picked.length > 0 && (e.preventDefault(), add())}
                            inputMode="numeric"
                            error={over ? `Mavjud ${formatQuantity(r.available)}` : undefined}
                            className="ml-auto w-24 [&>label]:sr-only [&_input]:text-right"
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}
