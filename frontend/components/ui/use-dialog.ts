"use client";

import { useEffect, useRef } from "react";

/**
 * Native `<dialog>` ni `open` holatiga bogʻlaydi: `showModal()` fokusni ichida ushlaydi,
 * Esc yopadi (`cancel`), yopilganda fokus chaqirgan elementga qaytadi.
 */
export function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const opener = document.activeElement as HTMLElement | null;
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      return () => {
        if (dialog.open) {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }
        opener?.focus?.();
      };
    }
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    function onCancel(e: Event) {
      e.preventDefault();
      onCloseRef.current();
    }
    dialog.addEventListener("cancel", onCancel);
    return () => dialog.removeEventListener("cancel", onCancel);
  }, [open]);

  return ref;
}
