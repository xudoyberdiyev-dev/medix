"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { QM_CREATE } from "./api";
import { CreateForm } from "./customer-return-drawer";

/** QM — yangi mijozdan qaytarish toʻliq sahifa (prototip `StockDocs`, kind = qm). */
export function NewCustomerReturnPage() {
  const t = useTranslations("customerReturns");
  const me = useMe();
  const router = useRouter();
  if (me.data && !can(me.data, QM_CREATE)) return <ForbiddenState description={t("forbidden")} />;
  return <CreateForm page onClose={() => router.push("/customer-returns")} onCreated={(id) => router.replace(`/customer-returns/${id}`)} />;
}
