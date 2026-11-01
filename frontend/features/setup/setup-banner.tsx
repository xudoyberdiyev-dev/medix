"use client";

import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { useMe } from "@/features/auth/session";
import { useSetupStatus } from "./api";

/** Bosh sahifada CEO uchun: sozlash ustasi yakunlanmagan boʻlsa eslatma. */
export function SetupBanner() {
  const me = useMe();
  if (me.data?.role.code !== "DIRECTOR") return null;
  return <DirectorSetupBanner />;
}

function DirectorSetupBanner() {
  const status = useSetupStatus();
  if (!status.data || status.data.completed) return null;
  return (
    <Alert
      tone="info"
      title="Tizim hali sozlanmagan"
      action={
        <Link
          href="/setup"
          className="inline-flex h-control-sm items-center rounded-control border border-border bg-surface px-3 text-table font-medium hover:bg-background"
        >
          Sozlash ustasini ochish
        </Link>
      }
    >
      Kompaniya, filiallar, omborlar va xodimlarni kiriting — shundan keyin xodimlar ishlay oladi.
    </Alert>
  );
}
