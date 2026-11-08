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
import { formatDateTime, formatQuantity } from "@/lib/format";
import { TRANSFER_RESOLVE, useResolveShortage, useTransferShortage, type ShortageKind, type WarehouseTransferDetail } from "./api";

/** OK kamomadi: holat, tarix va hal qilish (transfer.resolve). */
export function ShortagePanel({ doc }: { doc: WarehouseTransferDetail }) {
  const t = useTranslations("warehouseTransfers.shortage");
  const tw = useTranslations("writeOffs");
  const tf = useTranslations("warehouseTransfers");
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
      <Alert tone={open ? "danger" : "info"} title={t(open ? "titleOpen" : "titleDone", { qty: formatQuantity(doc.shortageQty) })}>
        <div className="flex flex-col gap-2">
          {doc.receiveNote ? <span>{doc.receiveNote}</span> : null}
          {last ? (
            <span>
              {last.kind === "RETURN" ? t("returned") : t("writtenOff")}
              {last.writeOffNumber ? (
                <>
                  {" "}
                  <Link className="underline" href={`/write-offs?open=${last.writeOffId ?? ""}`}>
                    {last.writeOffNumber}
                  </Link>
                  {last.writeOffStatus ? ` (${tw(`status.${last.writeOffStatus}`)})` : ""}
                </>
              ) : null}{" "}
              · {last.resolvedBy}, {formatDateTime(new Date(last.resolvedAt))}
              {last.note ? ` · ${last.note}` : ""}
            </span>
          ) : null}
          {canResolve ? (
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" icon={FileMinus} onClick={() => setKind("WRITE_OFF")}>
                {t("writeOff")}
              </Button>
              <Button variant="secondary" size="sm" icon={Undo2} onClick={() => setKind("RETURN")}>
                {t("return")}
              </Button>
            </div>
          ) : null}
        </div>
      </Alert>
      <Modal
        open={kind !== null}
        onClose={() => setKind(null)}
        title={kind ? t(`kind.${kind}.title`) : ""}
        primaryAction={{
          label: kind === "RETURN" ? t("returnAction") : t("writeOff"),
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
                    title: pending ? t("pendingToast") : t(`kind.${kind}.done`),
                    description: d.history[0]?.writeOffNumber ?? d.number,
                  });
                },
                onError: (e) => toast({ tone: "danger", title: tf("failed"), description: describeError(e).message ?? tf("retryHint") }),
              },
            ),
        }}
      >
        <div className="flex flex-col gap-3">
          <p className="text-body text-text-secondary">{kind ? t(`kind.${kind}.hint`, { hc: "HC" }) : ""}</p>
          <TextField label={t("note")} value={note} onChange={setNote} placeholder={t("notePlaceholder")} />
        </div>
      </Modal>
    </>
  );
}
