"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Modal } from "@/components/ui/modal";
import { Select } from "@/components/ui/select";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { ensureCsrf } from "@/features/auth/session";
import { ACCOUNT_KIND, type MoneyAccount } from "@/features/payments/api";
import { describeError } from "@/features/setup/form-error";
import { api, unwrap } from "@/lib/api/client";

type Kind = MoneyAccount["kind"];

const KINDS = (["CASH", "BANK", "TERMINAL"] as const).map((k) => ({ value: k, label: ACCOUNT_KIND[k] }));

/** Mahalliy tekshiruv: bank hisob raqami — 20 raqam (backend ham tekshiradi). */
export function accountFormErrors(kind: Kind, name: string, accountNo: string): Record<string, string> {
  const e: Record<string, string> = {};
  if (!name.trim()) e.name = "Hisob nomini kiriting.";
  if (kind === "BANK" && !/^\d{20}$/.test(accountNo)) e.accountNo = "Hisob raqami 20 ta raqamdan iborat boʻlishi kerak.";
  return e;
}

/** Yangi pul hisobi (SPEC 5.5): qoʻshimcha kassa, bank hisobi yoki Terminal — Direktor / Admin (settings.view). */
export function AccountDialog(props: { branchId: number; onClose: () => void }) {
  const qc = useQueryClient();
  const [kind, setKind] = useState<Kind>("BANK");
  const [name, setName] = useState("");
  const [bankName, setBankName] = useState("");
  const [accountNo, setAccountNo] = useState("");
  const [local, setLocal] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save() {
    const e = accountFormErrors(kind, name, accountNo);
    setLocal(e);
    if (Object.keys(e).length > 0) return;
    setPending(true);
    setError(null);
    try {
      await ensureCsrf();
      const a = await unwrap(
        api.POST("/api/money-accounts", {
          body: {
            branchId: props.branchId,
            kind,
            name: name.trim(),
            bankName: kind === "BANK" && bankName.trim() ? bankName.trim() : undefined,
            accountNo: kind === "BANK" ? accountNo : undefined,
          },
        }),
      );
      await qc.invalidateQueries({ queryKey: ["money-accounts"] });
      toast({ tone: "success", title: "Hisob qoʻshildi", description: `${a.name} · ${a.code}` });
      props.onClose();
    } catch (err) {
      setError(err);
    } finally {
      setPending(false);
    }
  }

  const err = describeError(error);
  return (
    <Modal
      open
      onClose={props.onClose}
      title="Yangi hisob"
      primaryAction={{ label: "Hisobni saqlash", onClick: () => void save(), loading: pending }}
      secondaryAction={{ label: "Bekor qilish", onClick: props.onClose }}
    >
      <div className="flex flex-col gap-4">
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        <Select label="Turi" required value={kind} onChange={(v) => setKind((v as Kind | null) ?? "BANK")} options={KINDS} />
        <TextField
          label="Nomi"
          required
          value={name}
          onChange={setName}
          maxLength={120}
          placeholder={kind === "BANK" ? "Asosiy bank hisobi" : kind === "CASH" ? "Ikkinchi kassa" : "Terminal 2"}
          error={local.name ?? err.fields.name}
        />
        {kind === "BANK" ? (
          <>
            <TextField label="Bank" value={bankName} onChange={setBankName} maxLength={120} error={err.fields.bankName} />
            <TextField
              label="Hisob raqami"
              required
              value={accountNo}
              onChange={(v) => setAccountNo(v.replace(/\D/g, "").slice(0, 20))}
              inputMode="numeric"
              hint="20 raqam"
              error={local.accountNo ?? err.fields.accountNo}
            />
          </>
        ) : null}
      </div>
    </Modal>
  );
}
