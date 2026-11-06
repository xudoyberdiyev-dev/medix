"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useMe } from "@/features/auth/session";
import { LIVE_INVALIDATES, useLive } from "@/lib/live";

/** Real vaqt: shu filialda buyurtma, reys yoki kirim oʻzgarsa — ekrandagi roʻyxatlar darhol yangilanadi (SSE). */
export function LiveSync() {
  const me = useMe();
  const qc = useQueryClient();
  const enabled = Boolean(me.data);
  const refresh = useCallback(
    (keys: readonly (readonly string[])[]) => keys.forEach((queryKey) => void qc.invalidateQueries({ queryKey })),
    [qc],
  );
  useLive(["orders"], () => refresh(LIVE_INVALIDATES.orders), enabled);
  useLive(["trips"], () => refresh(LIVE_INVALIDATES.trips), enabled);
  useLive(["receipts"], () => refresh(LIVE_INVALIDATES.receipts), enabled);
  return null;
}
