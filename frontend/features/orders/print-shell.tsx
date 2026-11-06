"use client";

import { Printer } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Chop etish shakli uchun A4 kenglikdagi sahifa; maʼlumot tayyor boʻlganda chop etish oynasi bir marta ochiladi. */
export function PrintShell({ children, ready = false }: { children: ReactNode; ready?: boolean }) {
  const printed = useRef(false);
  useEffect(() => {
    if (ready && !printed.current) {
      printed.current = true;
      window.print();
    }
  }, [ready]);
  return (
    <main className="mx-auto max-w-[210mm] p-6 print:max-w-none print:p-0">
      {ready ? (
        <div className="mb-4 flex items-center justify-end gap-2 print:hidden">
          <Button icon={Printer} onClick={() => window.print()}>
            Chop etish
          </Button>
        </div>
      ) : null}
      {children}
    </main>
  );
}

/** Imzo joylari (F.I.Sh., imzo). */
export function Signatures({ roles }: { roles: string[] }) {
  return (
    <footer className="mt-10 grid grid-cols-2 gap-x-10 gap-y-8 text-caption">
      {roles.map((r) => (
        <div key={r} className="border-t border-text-primary pt-1">
          {r} (F.I.Sh., imzo)
        </div>
      ))}
    </footer>
  );
}
