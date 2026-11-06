"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { ApiError } from "@/lib/api/client";
import { useMe } from "./session";

/**
 * Ilova sahifalari faqat sessiya bilan. Yakuniy tekshiruv serverda (har API 401 qaytaradi);
 * bu yerda faqat foydalanuvchini toʻgʻri sahifaga yoʻnaltiramiz.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const unauthorized = me.error instanceof ApiError && me.error.isUnauthorized;

  useEffect(() => {
    if (unauthorized) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (me.data?.mustChangePassword) router.replace("/password");
  }, [unauthorized, me.data, pathname, router]);

  if (me.data && !me.data.mustChangePassword) return <>{children}</>;
  if (me.error && !unauthorized) {
    return (
      <div className="flex h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ErrorState onRetry={() => me.refetch()} />
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-screen" aria-busy="true">
      <div className="w-sidebar shrink-0 bg-brand-900" />
      <div className="flex flex-1 flex-col gap-4 p-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="w-96" />
      </div>
    </div>
  );
}
