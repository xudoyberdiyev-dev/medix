"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMe } from "@/features/auth/session";
import { useBranchStore } from "@/lib/stores/branch";
import { PaymentDrawer } from "./payment-drawer";
import { SupplierPaymentDrawer } from "./supplier-payment-drawer";

/** Toʻlov hujjati — toʻliq sahifa: `/payments/mt/new|<id>`, `/payments/yt/new|<id>` (kirimdan: `?supplier=&supplierName=&amount=`). */
export function PaymentDocPage({ kind, id }: { kind: "mt" | "yt"; id: number | null }) {
  const router = useRouter();
  const params = useSearchParams();
  const me = useMe();
  const selectedBranch = useBranchStore((s) => s.branchId);
  const workBranch = me.data?.allBranches ? (selectedBranch ?? null) : (me.data?.branchId ?? null);
  const back = () => router.push("/payments");
  const created = (n: number) => router.replace(`/payments/${kind}/${n}`);
  if (kind === "mt") return <PaymentDrawer frame="page" id={id} branchId={workBranch} onClose={back} onCreated={created} />;
  const supplier = Number(params.get("supplier"));
  const initial =
    id == null && supplier > 0
      ? { supplierId: supplier, supplier: params.get("supplierName") ?? "", amount: params.get("amount") ?? "" }
      : undefined;
  return <SupplierPaymentDrawer frame="page" id={id} branchId={workBranch} initial={initial} onClose={back} onCreated={created} />;
}
