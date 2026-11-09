"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, ForbiddenState } from "@/components/ui/system-states";
import { useWarehouses } from "@/features/organization/api";
import { ApiError } from "@/lib/api/client";
import { useBranches, useEmployees } from "./api";
import { StaffManager } from "./staff-manager";

/** «Sozlamalar → Xodimlar» (prototip AdminStaff → WizStaff sahifa rejimi): qator bosilsa — xodim kartasi. */
export function StaffPage() {
  const t = useTranslations("employees");
  const router = useRouter();
  const list = useEmployees();
  const branches = useBranches();
  const warehouses = useWarehouses();
  if (list.error instanceof ApiError && list.error.isForbidden) return <ForbiddenState description={t("forbidden")} />;
  if (branches.error) return <ErrorState onRetry={() => branches.refetch()} />;
  return (
    <StaffManager
      page
      branches={(branches.data ?? []).map((b) => ({ id: b.id, name: b.name }))}
      warehouses={(warehouses.data ?? []).map((w) => ({ id: w.id, branchId: w.branchId, name: w.name }))}
      onOpenEmp={(e) => router.push(`/settings/employees/${e.id}`)}
    />
  );
}
