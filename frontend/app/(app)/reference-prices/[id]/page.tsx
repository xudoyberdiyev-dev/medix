import { notFound } from "next/navigation";
import { TopBar } from "@/components/shell/topbar";
import { RefComparePage } from "@/features/reference-prices/ref-compare-page";

/** Referent narx bilan solishtirish natijasi (O14); `?mode=RECEIPT&receiptId=` — kirim kartochkasidan. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string; receiptId?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) notFound();
  const receiptId = Number(sp.receiptId);
  return (
    <>
      <TopBar titleKey="referencePrices" />
      <main className="flex-1 overflow-y-auto p-6">
        <RefComparePage
          key={n}
          id={n}
          initialMode={sp.mode === "RECEIPT" ? "RECEIPT" : "SALE"}
          receiptId={Number.isInteger(receiptId) && receiptId > 0 ? receiptId : undefined}
        />
      </main>
    </>
  );
}
