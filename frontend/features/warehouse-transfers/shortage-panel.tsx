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
import { formatDateTime, formatQuantity } from "@/lib/format";
import { TRANSFER_RESOLVE, useResolveShortage, useTransferShortage, type ShortageKind, type WarehouseTransferDetail } from "./api";

const KIND_TEXT: Record<ShortageKind, { title: string; hint: string; done: string }> = {
  WRITE_OFF: {
    title: "Kamomadni hisobdan chiqarish",
    hint: "Hisobdan chiqarish hujjati (HC, sabab «Kamomad») tuziladi. Tovar joʻnatishda chiqqan — qoldiq oʻzgarmaydi. 5.000.000,00 dan katta summa — Direktor tasdigʻi bilan.",
    done: "Hisobdan chiqarish hujjati tuzildi",
  },
  RETURN: {
    title: "Topildi — manbaga qaytarish",
    hint: "Kamomad tovari manba zonaga qaytariladi (qoldiq oshadi).",
    done: "Tovar manba zonaga qaytarildi",
  },
};

/** OK kamomadi: holat, tarix va hal qilish (transfer.resolve). */
export function ShortagePanel({ doc }: { doc: WarehouseTransferDetail }) {
  const me = useMe();
  const info = useTransferShortage(doc.id, doc.status === "RECEIVED" && doc.shortageQty > 0);
  const resolve = useResolveShortage();
  const [kind, setKind] = useState<ShortageKind | null>(null);
  const [note, setNote] = useState("");
  if (doc.status !== "RECEIVED" || doc.shortageQty === 0) return null;
  const data = info.data;
  const open = data?.open ?? false;
  const canResolve = open && can(me.data, TRANSFER_RESOLVE);
  const last = data?.history[0];
  return (
    <>
      <Alert
        tone={open ? "danger" : "info"}
        title={`Kamomad: ${formatQuantity(doc.shortageQty)} dona${open ? " — hal qilinmagan" : " — hal qilindi"}`}
      >
        <div className="flex flex-col gap-2">
          {doc.receiveNote ? <span>{doc.receiveNote}</span> : null}
          {last ? (
            <span>
              {last.kind === "RETURN" ? "Manbaga qaytarildi" : "Hisobdan chiqarish"}
              {last.writeOffNumber ? (
                <>
                  {" "}
                  <Link className="underline" href={`/write-offs?open=${last.writeOffId ?? ""}`}>
                    {last.writeOffNumber}
                  </Link>
                  {last.writeOffStatus ? ` (${HC_STATUS_LABELS[last.writeOffStatus]})` : ""}
                </>
              ) : null}{" "}
              · {last.resolvedBy}, {formatDateTime(new Date(last.resolvedAt))}
              {last.note ? ` · ${last.note}` : ""}
            </span>
          ) : null}
          {canResolve ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={FileMinus} onClick={() => setKind("WRITE_OFF")}>
                Hisobdan chiqarish
              </Button>
              <Button variant="secondary" size="sm" icon={Undo2} onClick={() => setKind("RETURN")}>
                Manbaga qaytarish
              </Button>
            </div>
          ) : null}
        </div>
      </Alert>
      <Modal
        open={kind !== null}
        onClose={() => setKind(null)}
        title={kind ? KIND_TEXT[kind].title : ""}
        primaryAction={{
          label: kind === "RETURN" ? "Qaytarish" : "Hisobdan chiqarish",
          loading: resolve.isPending,
          onClick: () =>
            kind &&
            resolve.mutate(
              { id: doc.id, kind, note: note.trim() },
              {
                onSuccess: (d) => {
                  setKind(null);
                  const pending = d.history[0]?.writeOffStatus === "PENDING";
                  toast({
                    tone: "success",
                    title: pending ? "Hisobdan chiqarish tasdiqqa yuborildi" : KIND_TEXT[kind].done,
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
          <p className="text-body text-text-secondary">{kind ? KIND_TEXT[kind].hint : ""}</p>
          <TextField label="Izoh" value={note} onChange={setNote} placeholder="Masalan: mashinada qolgan, haydovchi topdi" />
        </div>
      </Modal>
    </>
  );
}
