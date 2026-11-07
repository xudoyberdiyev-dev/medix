"use client";

import { FileMinus, Undo2 } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime, formatMoney, formatQuantity } from "@/lib/format";
import {
  TRANSFER_RESOLVE,
  useBranchSaleShortage,
  useResolveBranchSaleShortage,
  type BranchSaleDetail,
  type FsShortageBearer,
  type FsShortageInfo,
  type FsShortageKind,
} from "./api";

export type FsShortageChoice = "BUYER_WRITE_OFF" | "SELLER_WRITE_OFF" | "RETURN";

/** Har yoʻlning server parametrlari; matnlari — lugʻatda `branchSales.shortage.choice.*`. */
const CHOICES: Record<FsShortageChoice, { kind: FsShortageKind; bearer: FsShortageBearer }> = {
  BUYER_WRITE_OFF: { kind: "WRITE_OFF", bearer: "BUYER" },
  SELLER_WRITE_OFF: { kind: "WRITE_OFF", bearer: "SELLER" },
  RETURN: { kind: "RETURN", bearer: "SELLER" },
};

/** Ruxsat va filial bo'yicha mavjud yo'llar (tovar harakati qaysi filial omborida bo'lsa — o'sha filial hal qiladi). */
export function shortageChoices(info: Pick<FsShortageInfo, "open" | "canResolveAsBuyer" | "canResolveAsSeller">): FsShortageChoice[] {
  if (!info.open) return [];
  const out: FsShortageChoice[] = [];
  if (info.canResolveAsBuyer) out.push("BUYER_WRITE_OFF");
  if (info.canResolveAsSeller) out.push("SELLER_WRITE_OFF", "RETURN");
  return out;
}

/** FS kamomadi: holat, oxirgi qaror va hal qilish (transfer.resolve). */
export function BranchSaleShortagePanel({ doc }: { doc: BranchSaleDetail }) {
  const t = useTranslations("branchSales.shortage");
  const tw = useTranslations("writeOffs");
  const tf = useTranslations("warehouseTransfers");
  const me = useMe();
  const active = doc.status === "RECEIVED" && doc.shortageQty > 0;
  const info = useBranchSaleShortage(doc.id, active);
  const resolve = useResolveBranchSaleShortage();
  const [choice, setChoice] = useState<FsShortageChoice | null>(null);
  const [note, setNote] = useState("");
  if (!active) return null;
  const data = info.data;
  const open = data?.open ?? false;
  const choices = data && can(me.data, TRANSFER_RESOLVE) ? shortageChoices(data) : [];
  const last = data?.history[0];
  return (
    <>
      <Alert
        tone={open ? "danger" : "info"}
        title={t(open ? "titleOpen" : "titleDone", {
          qty: formatQuantity(doc.shortageQty),
          amount: data?.amount ? ` · ${formatMoney(data.amount)}` : "",
        })}
      >
        <div className="flex flex-col gap-2">
          {doc.receiveNote ? <span>{doc.receiveNote}</span> : null}
          {last ? (
            <span>
              {last.kind === "RETURN" ? t("returned") : t("writtenOff", { bearer: t(`bearer.${last.bearer}`) })}
              {last.writeOffNumber ? (
                <>
                  {" "}
                  <Link className="underline" href={`/write-offs?open=${last.writeOffId ?? ""}`}>
                    {last.writeOffNumber}
                  </Link>
                  {last.writeOffStatus ? ` (${tw(`status.${last.writeOffStatus}`)})` : ""}
                </>
              ) : null}
              {last.debtChange && last.debtChange !== "0.00" ? ` · ${t("debt", { amount: formatMoney(last.debtChange) })}` : ""} ·{" "}
              {last.resolvedBy}, {formatDateTime(new Date(last.resolvedAt))}
              {last.note ? ` · ${last.note}` : ""}
            </span>
          ) : open ? (
            <span>{t("openHint")}</span>
          ) : null}
          {choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <Button key={c} variant="secondary" size="sm" icon={c === "RETURN" ? Undo2 : FileMinus} onClick={() => setChoice(c)}>
                  {t(`choice.${c}.button`)}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </Alert>
      <Modal
        open={choice !== null}
        onClose={() => setChoice(null)}
        title={choice ? t(`choice.${choice}.title`) : ""}
        primaryAction={{
          label: choice === "RETURN" ? t("returnAction") : t("writeOffAction"),
          loading: resolve.isPending,
          onClick: () =>
            choice &&
            resolve.mutate(
              { id: doc.id, kind: CHOICES[choice].kind, bearer: CHOICES[choice].bearer, note: note.trim() },
              {
                onSuccess: (d) => {
                  setChoice(null);
                  setNote("");
                  const pending = d.history[0]?.writeOffStatus === "PENDING";
                  toast({
                    tone: "success",
                    title: pending ? t("pendingToast") : choice === "RETURN" ? t("returnedToast") : t("writtenOffToast"),
                    description: d.history[0]?.writeOffNumber ?? d.number,
                  });
                },
                onError: (e) => toast({ tone: "danger", title: tf("failed"), description: describeError(e).message ?? tf("retryHint") }),
              },
            ),
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{choice ? t(`choice.${choice}.hint`, { hc: "HC" }) : ""}</p>
          <TextField label={t("note")} value={note} onChange={setNote} placeholder={t("notePlaceholder")} />
        </div>
      </Modal>
    </>
  );
}
