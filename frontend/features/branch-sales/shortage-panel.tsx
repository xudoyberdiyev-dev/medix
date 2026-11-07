"use client";

import { FileMinus, Undo2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { HC_STATUS_LABELS } from "@/features/write-offs/api";
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

const CHOICES: Record<FsShortageChoice, { kind: FsShortageKind; bearer: FsShortageBearer; button: string; title: string; hint: string }> = {
  BUYER_WRITE_OFF: {
    kind: "WRITE_OFF",
    bearer: "BUYER",
    button: "Xaridor zimmasida",
    title: "Kamomad xaridor zimmasida — hisobdan chiqarish",
    hint: "Xaridor omborida hisobdan chiqarish hujjati (HC, sabab «Kamomad») tuziladi, qoldiq oʻzgarmaydi. Filiallararo qarz joʻnatilgan summada qoladi.",
  },
  SELLER_WRITE_OFF: {
    kind: "WRITE_OFF",
    bearer: "SELLER",
    button: "Sotuvchi zimmasida",
    title: "Kamomad sotuvchi zimmasida — hisobdan chiqarish",
    hint: "Sotuvchi omborida HC tuziladi (qoldiq oʻzgarmaydi). Xaridor filial qarzi kamomad summasiga kamayadi.",
  },
  RETURN: {
    kind: "RETURN",
    bearer: "SELLER",
    button: "Topildi — sotuvchiga qaytarish",
    title: "Topildi — sotuvchiga qaytarish",
    hint: "Tovar joʻnatilmay qolgan: sotuvchi zonasiga qaytariladi (qoldiq oshadi), xaridor filial qarzi kamomad summasiga kamayadi.",
  },
};

/** Ruxsat va filial bo'yicha mavjud yo'llar (tovar harakati qaysi filial omborida bo'lsa — o'sha filial hal qiladi). */
export function shortageChoices(info: Pick<FsShortageInfo, "open" | "canResolveAsBuyer" | "canResolveAsSeller">): FsShortageChoice[] {
  if (!info.open) return [];
  const out: FsShortageChoice[] = [];
  if (info.canResolveAsBuyer) out.push("BUYER_WRITE_OFF");
  if (info.canResolveAsSeller) out.push("SELLER_WRITE_OFF", "RETURN");
  return out;
}

const BEARER_TEXT: Record<FsShortageBearer, string> = { BUYER: "xaridor zimmasida", SELLER: "sotuvchi zimmasida" };

/** FS kamomadi: holat, oxirgi qaror va hal qilish (transfer.resolve). */
export function BranchSaleShortagePanel({ doc }: { doc: BranchSaleDetail }) {
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
        title={`Kamomad: ${formatQuantity(doc.shortageQty)} dona${data?.amount ? ` · ${formatMoney(data.amount)}` : ""}${open ? " — hal qilinmagan" : " — hal qilindi"}`}
      >
        <div className="flex flex-col gap-2">
          {doc.receiveNote ? <span>{doc.receiveNote}</span> : null}
          {last ? (
            <span>
              {last.kind === "RETURN" ? "Sotuvchiga qaytarildi" : `Hisobdan chiqarish, ${BEARER_TEXT[last.bearer]}`}
              {last.writeOffNumber ? (
                <>
                  {" "}
                  <Link className="underline" href={`/write-offs?open=${last.writeOffId ?? ""}`}>
                    {last.writeOffNumber}
                  </Link>
                  {last.writeOffStatus ? ` (${HC_STATUS_LABELS[last.writeOffStatus]})` : ""}
                </>
              ) : null}
              {last.debtChange && last.debtChange !== "0.00" ? ` · qarz ${formatMoney(last.debtChange)}` : ""} · {last.resolvedBy},{" "}
              {formatDateTime(new Date(last.resolvedAt))}
              {last.note ? ` · ${last.note}` : ""}
            </span>
          ) : open ? (
            <span>Qarz joʻnatilgan summada. Kamomad kimning zimmasida ekanini aniqlab, hal qiling.</span>
          ) : null}
          {choices.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {choices.map((c) => (
                <Button key={c} variant="secondary" size="sm" icon={c === "RETURN" ? Undo2 : FileMinus} onClick={() => setChoice(c)}>
                  {CHOICES[c].button}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </Alert>
      <Modal
        open={choice !== null}
        onClose={() => setChoice(null)}
        title={choice ? CHOICES[choice].title : ""}
        primaryAction={{
          label: choice === "RETURN" ? "Qaytarish" : "Hisobdan chiqarish",
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
                    title: pending
                      ? "Hisobdan chiqarish tasdiqqa yuborildi"
                      : choice === "RETURN"
                        ? "Tovar sotuvchiga qaytarildi"
                        : "Hisobdan chiqarish hujjati tuzildi",
                    description: d.history[0]?.writeOffNumber ?? d.number,
                  });
                },
                onError: (e) =>
                  toast({ tone: "danger", title: "Bajarilmadi", description: describeError(e).message ?? "Qayta urinib koʻring." }),
              },
            ),
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{choice ? CHOICES[choice].hint : ""}</p>
          <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: yuklashda qolib ketgan, haydovchi tasdiqladi" />
        </div>
      </Modal>
    </>
  );
}
