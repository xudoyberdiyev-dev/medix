"use client";

import { useTranslations } from "next-intl";
import { ForbiddenState } from "@/components/ui/system-states";
import { can } from "@/features/auth/can";
import { useMe } from "@/features/auth/session";
import { RolesMatrix } from "./roles-matrix";

/** «Sozlamalar → Rollar va ruxsatlar» (prototip AdminStaff → WizRoles, sahifa rejimi). */
export function RolesPage() {
  const t = useTranslations("roles");
  const me = useMe();
  if (me.data && !can(me.data, "roles.view")) return <ForbiddenState description={t("forbidden")} />;
  return <RolesMatrix mode="page" />;
}
