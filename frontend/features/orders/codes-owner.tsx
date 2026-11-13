"use client";

import { ArrowLeftRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { useSetCodesOwner, type OrderDetail } from "./api";

const CLOSED = new Set<OrderDetail["status"]>(["DELIVERED", "UNDELIVERED", "REJECTED", "CANCELLED"]);

/** O10b: «Kodlar: Mijoz nomiga / Zaxira kodlarga» — standart toʻlov turidan; Ombor mudiri, Filial rahbari, Direktor oʻzgartiradi. */
export function CodesOwnerValue({ doc }: { doc: OrderDetail }) {
  const t = useTranslations("orders.codesOwner");
  const me = useMe();
  const set = useSetCodesOwner();
  const editable = can(me.data, "marking.owner") && !CLOSED.has(doc.status) && doc.lines.some((l) => l.marked);
  const other = doc.codesOwner === "CUSTOMER" ? "RESERVE" : "CUSTOMER";
  const err = describeError(set.error).message;
  return (
    <span className="flex flex-col items-start gap-1">
      <span>
        {t(doc.codesOwner)}
        {doc.codesOwnerManual ? null : <span className="text-caption text-text-secondary"> · {t("byPayment")}</span>}
      </span>
      {editable ? (
        <Button
          size="sm"
          variant="tertiary"
          icon={ArrowLeftRight}
          loading={set.isPending}
          onClick={() =>
            set.mutate(
              { id: doc.id, owner: other },
              { onSuccess: () => toast({ tone: "success", title: t("changed"), description: t(other) }) },
            )
          }
        >
          {t(other === "RESERVE" ? "toReserve" : "toCustomer")}
        </Button>
      ) : null}
      {err ? <span className="text-caption text-danger">{err}</span> : null}
    </span>
  );
}
