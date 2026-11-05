"use client";

import { FileText } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { PAYMENT_TYPES } from "@/features/counterparties/api";
import { useBranchList } from "@/features/organization/api";
import { ApiError } from "@/lib/api/client";
import { formatMoney, formatQuantity } from "@/lib/format";
import { useOrder } from "./api";
import { day } from "./orders-page";
import { parseIds } from "./pick-sheet";
import { PrintShell as Shell, Signatures } from "./print-shell";

/**
 * Nakladnoy (/print/waybill?id=<buyurtma>): sotuvchi (filial rekvizitlari), xaridor, partiya va muddat bilan qatorlar,
 * narx QQS bilan. Brauzerda chop etiladi; server PDF (OpenHTMLtoPDF) — keyingi bosqichda bir xil shakl bilan.
 */
export function WaybillPage() {
  const params = useSearchParams();
  const id = parseIds(params.get("id"))[0] ?? null;
  const order = useOrder(id);
  const branches = useBranchList();

  if (id === null) {
    return (
      <Shell>
        <EmptyState
          icon={FileText}
          title="Buyurtma tanlanmagan"
          description="Buyurtma kartochkasidagi «Nakladnoyni chop etish»ni bosing."
        />
      </Shell>
    );
  }
  const error = order.error ?? branches.error;
  if (error) {
    return (
      <Shell>
        {error instanceof ApiError && error.isForbidden ? (
          <ForbiddenState description="Nakladnoyni koʻrish uchun buyurtmalarni koʻrish ruxsati kerak." />
        ) : (
          <ErrorState onRetry={() => void Promise.all([order.refetch(), branches.refetch()])} />
        )}
      </Shell>
    );
  }
  if (!order.data || !branches.data) {
    return (
      <Shell>
        <Skeleton className="h-64 w-full" />
      </Shell>
    );
  }

  const o = order.data;
  const number = o.documents.waybillNumber;
  if (!number) {
    return (
      <Shell>
        <EmptyState
          icon={FileText}
          title="Nakladnoy hali berilmagan"
          description={`${o.number}: nakladnoy Joʻnatish sahifasida reys tuzilganda yoki «Oʻzi olib ketadi»da raqamlanadi.`}
        />
      </Shell>
    );
  }
  const seller = branches.data.find((b) => b.id === o.branchId);
  const withPrice = o.lines.some((l) => l.price);
  const qty = o.lines.reduce((s, l) => s + l.qty, 0);
  const pay = PAYMENT_TYPES.find((p) => p.value === o.paymentType)?.label ?? o.paymentType;

  return (
    <Shell ready>
      <header className="border-b border-text-primary pb-3 text-center">
        <h1 className="text-page-title">
          Nakladnoy <span className="font-mono">{number}</span>
        </h1>
        <div className="text-text-secondary">
          {day(o.deliveryDate ?? o.orderDate)} · buyurtma <span className="font-mono">{o.number}</span>
        </div>
      </header>

      <dl className="mt-4 grid grid-cols-2 gap-6">
        <div>
          <dt className="text-caption text-text-secondary">Yetkazib beruvchi</dt>
          <dd className="font-medium">{seller?.legalName ?? "—"}</dd>
          <dd className="text-caption">STIR: {seller?.tin ?? "—"}</dd>
          <dd className="text-caption">{[seller?.address, seller?.phone].filter(Boolean).join(" · ") || "—"}</dd>
          <dd className="text-caption">Ombor: {o.warehouse}</dd>
        </div>
        <div>
          <dt className="text-caption text-text-secondary">Qabul qiluvchi</dt>
          <dd className="font-medium">{o.customer}</dd>
          <dd className="text-caption">STIR: {o.customerTin ?? "—"}</dd>
          <dd className="text-caption">{o.address ?? "—"}</dd>
          <dd className="text-caption">
            Toʻlov: {pay}
            {o.documents.tripNumber ? ` · Reys ${o.documents.tripNumber}` : ""}
          </dd>
        </div>
      </dl>

      <table className="mt-4 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-text-primary text-caption text-text-secondary">
            <th className="py-1 pr-2 font-medium">№</th>
            <th className="py-1 pr-2 font-medium">Mahsulot</th>
            <th className="py-1 pr-2 font-medium">Partiya · muddati</th>
            <th className="py-1 pr-2 text-right font-medium">Miqdor</th>
            {withPrice ? <th className="py-1 pr-2 text-right font-medium">Narx (QQS bilan)</th> : null}
            {withPrice ? <th className="py-1 text-right font-medium">Summa, soʻm</th> : null}
          </tr>
        </thead>
        <tbody>
          {o.lines.map((l, i) => (
            <tr key={l.id} className="break-inside-avoid border-b border-border align-top">
              <td className="py-1.5 pr-2 tabular-nums">{i + 1}</td>
              <td className="py-1.5 pr-2">
                <div>
                  <span className="font-mono text-text-secondary">{l.productCode}</span> {l.productName}
                </div>
                {l.manufacturer ? <div className="text-caption text-text-secondary">{l.manufacturer}</div> : null}
              </td>
              <td className="py-1.5 pr-2 text-caption">
                {l.reserved.length > 0
                  ? l.reserved.map((r) => `${r.batch} · ${day(r.expiryDate)} — ${formatQuantity(r.qty)}`).join("; ")
                  : "—"}
              </td>
              <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatQuantity(l.qty)}</td>
              {withPrice ? (
                <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{l.price ? formatMoney(l.price) : "—"}</td>
              ) : null}
              {withPrice ? (
                <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{l.amount ? formatMoney(l.amount) : "—"}</td>
              ) : null}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-medium">
            <td className="py-1.5 pr-2" colSpan={3}>
              Jami
            </td>
            <td className="py-1.5 pr-2 text-right whitespace-nowrap tabular-nums">{formatQuantity(qty)}</td>
            {withPrice ? <td /> : null}
            {withPrice ? <td className="py-1.5 text-right whitespace-nowrap tabular-nums">{formatMoney(o.total)}</td> : null}
          </tr>
        </tfoot>
      </table>
      {o.note ? <p className="mt-3">Izoh: {o.note}</p> : null}

      <Signatures roles={["Berdi (Ombor mudiri)", "Yetkazdi (Haydovchi)", "Qabul qildi (Mijoz, M.Oʻ.)"]} />
    </Shell>
  );
}
