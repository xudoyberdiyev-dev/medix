"use client";

import { useTranslations } from "next-intl";
import { useRouter, useSearchParams } from "next/navigation";
import { ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { QY_CREATE } from "./api";
import { CreateForm, type ReturnPreset } from "./supplier-return-drawer";

/** QY — yangi YB ga qaytarish toʻliq sahifa (prototip `StockDocs`, kind = qy). Kirimdan: ?receipt=&supplier=&supplierName=&receiptNo=. */
export function NewSupplierReturnPage() {
  const t = useTranslations("supplierReturns");
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  if (me.data && !can(me.data, QY_CREATE)) return <ForbiddenState description={t("forbidden")} />;
  const receiptId = Number(params.get("receipt"));
  const supplierId = Number(params.get("supplier"));
  const preset: ReturnPreset | undefined =
    Number.isInteger(receiptId) && receiptId > 0 && Number.isInteger(supplierId) && supplierId > 0
      ? { receiptId, receiptNo: params.get("receiptNo") ?? "", supplierId, supplierName: params.get("supplierName") ?? "" }
      : undefined;
  return (
    <CreateForm
      page
      preset={preset}
      onClose={() => router.push("/supplier-returns")}
      onCreated={(id) => router.replace(`/supplier-returns/${id}`)}
    />
  );
}
