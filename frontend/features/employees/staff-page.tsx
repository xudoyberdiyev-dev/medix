"use client";

import { useBranchList, useWarehouses } from "@/features/organization/api";
import { StaffManager } from "./staff-manager";

/** «Sozlamalar → Xodimlar» (prototip AdminStaff → WizStaff sahifa rejimi). */
export function StaffPage() {
  const branches = useBranchList();
  const warehouses = useWarehouses();
  return (
    <StaffManager
      branches={(branches.data ?? []).map((b) => ({ id: b.id, name: b.name }))}
      warehouses={(warehouses.data ?? []).map((w) => ({ id: w.id, branchId: w.branchId, name: w.name }))}
    />
  );
}
