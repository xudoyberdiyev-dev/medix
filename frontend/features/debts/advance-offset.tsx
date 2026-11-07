"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { ensureCsrf, useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";
import { formatMoney } from "@/lib/format";

type Side = "CUSTOMER" | "SUPPLIER";

/** Avansni hisobga olish (AH): avans eng eski qarzlarga yopiladi. Tugma faqat avans va ochiq qarz bo'lsa ko'rinadi. */
export function AdvanceOffsetButton(props: { side: Side; branchId: number | null; counterpartyId: number }) {
  const t = useTranslations("debts.offset");
  const me = useMe();
  const qc = useQueryClient();
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
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [pending, setPending] = useState(false);

  if (!allowed || props.branchId == null || !preview.data || preview.data.available === "0.00") return null;

  async function submit() {
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const body = { branchId: props.branchId as number, counterpartyId: props.counterpartyId, amount: amount || undefined };
      const r =
        props.side === "CUSTOMER"
          ? await unwrap(api.POST("/api/advance-offsets/customer", { body }))
          : await unwrap(api.POST("/api/advance-offsets/supplier", { body }));
      await qc.invalidateQueries({ queryKey: ["debts"] });
      await qc.invalidateQueries({ queryKey: ["payments"] });
      toast({ tone: "success", title: t("done"), description: t("doneDescription", { number: r.number, amount: formatMoney(r.amount) }) });
      setOpen(false);
    } catch (e) {
      setError(e);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  const p = preview.data;
  return (
    <>
      <Button variant="secondary" icon={ArrowRightLeft} onClick={() => setOpen(true)}>
        {t("button")}
      </Button>
      {open ? (
        <Modal
          open
          onClose={() => setOpen(false)}
          size="lg"
          title={t("title")}
          primaryAction={{ label: t("submit"), onClick: () => void submit(), loading: pending }}
        >
          <div className="flex flex-col gap-4">
            {err.message ? <Alert tone="danger" title={err.message} /> : null}
            <p>
              {t.rich("summary", {
                advance: formatMoney(p.advance),
                debt: formatMoney(p.debt),
                available: formatMoney(p.available),
                num: (chunks) => <span className="font-mono tabular-nums">{chunks}</span>,
              })}
            </p>
            <ul className="flex flex-col">
              {p.lines.map((l) => (
                <li key={`${l.advanceDocNumber}:${l.debtDocNumber}`} className="flex justify-between gap-3 border-t border-border py-2">
                  <span>
                    <span className="font-mono">{l.advanceDocNumber}</span> → <span className="font-mono">{l.debtDocNumber}</span>
                  </span>
                  <span className="font-mono tabular-nums">{formatMoney(l.amount)}</span>
                </li>
              ))}
            </ul>
            <TextField
              label={t("amount")}
              variant="amount"
              value={amount}
              onChange={setAmount}
              suffix={t("currency")}
              hint={t("amountHint")}
            />
          </div>
        </Modal>
      ) : null}
    </>
  );
}
