"use client";

import { ExternalLink, Printer } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ErrorState } from "@/components/ui/system-states";
import { Spinner } from "@/components/ui/spinner";
import { formatDate, formatMoney, formatQuantity } from "@/lib/format";
import { useOrder } from "./api";
import { OrderStatusBadge } from "./orders-page";
import { shortName } from "./stage-hint";

const day = (iso: string) => formatDate(new Date(`${iso}T00:00:00`));

/** Panelda koʻrsatiladigan qatorlar soni — qolgani «Toʻliq ochish»da. */
export const PREVIEW_LINES = 8;

/**
 * U5: buyurtmani roʻyxatdan chiqmasdan koʻrish — oʻngdan panel: holat, mijoz, yetkazish, toʻlov, summalar, qatorlar
 * (birinchi {@link PREVIEW_LINES} tasi), tez amallar (terish varagʻi) va «Toʻliq ochish».
 */
export function OrderPreview({ id, onClose, onOpen }: { id: number; onClose: () => void; onOpen: (id: number) => void }) {
  const t = useTranslations("orders");
  const order = useOrder(id);
  const o = order.data;
  const printable = o && (o.status === "QUEUED" || o.status === "PICKING");
  return (
    <Drawer
      open
      onClose={onClose}
      size="sm"
      kind={t("preview.kind")}
      title={o ? o.customer : t("preview.loading")}
      subtitle={o?.number}
      status={o ? <OrderStatusBadge status={o.status} /> : undefined}
      actions={
        <>
          {printable ? (
            <Button variant="secondary" icon={Printer} onClick={() => window.open(`/print/picking?ids=${id}`, "_blank")}>
              {t("preview.printSheet")}
            </Button>
          ) : null}
          <Button icon={ExternalLink} onClick={() => onOpen(id)}>
            {t("preview.open")}
          </Button>
        </>
      }
    >
      {order.error ? (
        <ErrorState onRetry={() => order.refetch()} />
      ) : !o ? (
        <div className="flex justify-center py-10">
          <Spinner />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-body">
            <dt className="text-text-secondary">{t("list.col.date")}</dt>
            <dd className="tabular-nums">{day(o.orderDate)}</dd>
            <dt className="text-text-secondary">{t("list.col.delivery")}</dt>
            <dd>
              {o.deliveryType === "PICKUP" ? t("list.pickup") : t("list.delivery")}
              {o.deliveryDate ? <span className="text-text-secondary tabular-nums"> · {day(o.deliveryDate)}</span> : null}
              {o.address ? <span className="block text-caption text-text-secondary">{o.address}</span> : null}
            </dd>
            <dt className="text-text-secondary">{t("list.col.paymentType")}</dt>
            <dd>{t(`paymentType.${o.paymentType}`)}</dd>
            <dt className="text-text-secondary">{t("list.col.holder")}</dt>
            <dd>{o.holder ? shortName(o.holder) : "—"}</dd>
            <dt className="text-text-secondary">{t("list.col.operator")}</dt>
            <dd>{shortName(o.createdBy)}</dd>
            {o.note ? (
              <>
                <dt className="text-text-secondary">{t("preview.note")}</dt>
                <dd className="whitespace-pre-line">{o.note}</dd>
              </>
            ) : null}
          </dl>
          <section aria-label={t("preview.lines")}>
            <h3 className="mb-2 text-subtitle font-semibold">
              {t("preview.lines")} <span className="font-normal text-text-secondary tabular-nums">{formatQuantity(o.lines.length)}</span>
            </h3>
            <ul className="divide-y divide-border rounded-card border border-border">
              {o.lines.slice(0, PREVIEW_LINES).map((l) => (
                <li key={l.id} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.productName}</span>
                    <span className="text-caption text-text-secondary tabular-nums">
                      {formatQuantity(l.qty)} × {l.price ? formatMoney(l.price) : "—"}
                    </span>
                  </span>
                  <span className="shrink-0 tabular-nums">{l.amount ? formatMoney(l.amount) : "—"}</span>
                </li>
              ))}
            </ul>
            {o.lines.length > PREVIEW_LINES ? (
              <p className="mt-1.5 text-caption text-text-secondary">{t("preview.moreLines", { n: o.lines.length - PREVIEW_LINES })}</p>
            ) : null}
          </section>
          <dl className="flex flex-col gap-1 rounded-card bg-table-header px-3 py-2.5">
            <div className="flex justify-between">
              <dt className="text-text-secondary">{t("entry.tDisc")}</dt>
              <dd className="tabular-nums">{formatMoney(o.discountTotal)}</dd>
            </div>
            <div className="flex justify-between font-semibold">
              <dt>{t("list.col.total")}</dt>
              <dd className="tabular-nums">{formatMoney(o.total)}</dd>
            </div>
          </dl>
        </div>
      )}
    </Drawer>
  );
}
