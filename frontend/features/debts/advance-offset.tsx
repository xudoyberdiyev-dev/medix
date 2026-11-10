"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowRightLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { api, unwrap } from "@/lib/api/client";

type Side = "CUSTOMER" | "SUPPLIER";

/**
 * Qarz kartochkasidagi «Avansni hisobga olish» — avans va ochiq qarz boʻlsa koʻrinadi; bosilsa hujjat sahifasi
 * (prototip `AdvanceDoc`: `/debts/advance/new`) ochiladi — taqsimot avtomatik yoki qoʻlda.
 */
export function AdvanceOffsetButton(props: { side: Side; branchId: number | null; counterpartyId: number }) {
  const t = useTranslations("debts.offset");
  const me = useMe();
  const router = useRouter();
  const allowed = can(me.data, props.side === "CUSTOMER" ? "payments.mt" : "payments.yt") && can(me.data, "payments.view");
  const preview = useQuery({
    queryKey: ["debts", props.side, "offset-preview", props.counterpartyId, props.branchId],
    queryFn: () => {
      const params = { query: { branchId: props.branchId as number, counterpartyId: props.counterpartyId } };
      return props.side === "CUSTOMER"
        ? unwrap(api.GET("/api/advance-offsets/customer/preview", { params }))
        : unwrap(api.GET("/api/advance-offsets/supplier/preview", { params }));
    },
    enabled: allowed && props.branchId != null,
  });

  if (!allowed || props.branchId == null || !preview.data || preview.data.available === "0.00") return null;
  return (
    <Button
      variant="secondary"
      icon={ArrowRightLeft}
      onClick={() => router.push(`/debts/advance/new?side=${props.side}&party=${props.counterpartyId}&branch=${props.branchId}`)}
    >
      {t("button")}
    </Button>
  );
}
