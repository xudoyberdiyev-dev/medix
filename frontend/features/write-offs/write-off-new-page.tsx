"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { HC_CREATE } from "./api";
import { CreateForm } from "./write-off-drawer";

/** HC — yangi hisobdan chiqarish toʻliq sahifa (prototip `StockDocs`, kind = hc). */
export function NewWriteOffPage() {
  const t = useTranslations("writeOffs");
  const me = useMe();
  const router = useRouter();
  if (me.data && !can(me.data, HC_CREATE)) return <ForbiddenState description={t("forbidden")} />;
  return <CreateForm page onClose={() => router.push("/write-offs")} onCreated={(id) => router.replace(`/write-offs/${id}`)} />;
}
