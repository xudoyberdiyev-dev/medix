"use client";

import { Construction } from "lucide-react";
import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/ui/system-states";
import { useMe } from "@/features/auth/session";
import { CashierPanel } from "@/features/cash/cashier-panel";
import { AccountantHome } from "@/features/home/accountant-home";
import { BranchHome } from "@/features/home/branch-home";
import { DirectorHome } from "@/features/home/director-home";
import { OperatorHome } from "@/features/home/operator-home";
import { PurchaserHome } from "@/features/home/purchaser-home";
import { DriverPage } from "@/features/orders/driver-page";
import { MarkingPage } from "@/features/orders/marking-page";
import { MonitorPage } from "@/features/orders/monitor-page";
import { PickingPage } from "@/features/orders/picking-page";
import { SetupBanner } from "@/features/setup/setup-banner";

/** Bosh sahifa rolga qarab (SPEC 8): Kassir — Kassir paneli; Direktor/Admin/Buxgalter/Filial rahbari — koʻrsatkichlar bosh sahifasi; Operator — oʻz savdosi; Xarid — kirimlar, YB qarzi, bonus; boshqa rollar sahifalari 10-bosqichda qoʻshiladi. */
export function HomeContent() {
  const t = useTranslations("home");
  const me = useMe();
  const role = me.data?.role.code;
  if (role === "CASHIER") return <CashierPanel />;
  // Prototip: ombor rollari uchun bosh sahifa — oʻz paneli
  if (role === "WAREHOUSE_MANAGER") return <MonitorPage />;
  if (role === "PICKER") return <PickingPage />;
  if (role === "MARKER") return <MarkingPage />;
  if (role === "DRIVER") return <DriverPage />;
  if (role === "OPERATOR" || role === "PURCHASER")
    return (
      <>
        <div className="mb-6 empty:hidden">
          <SetupBanner />
        </div>
        {role === "OPERATOR" ? <OperatorHome /> : <PurchaserHome />}
      </>
    );
  if (role === "DIRECTOR" || role === "ADMIN" || role === "ACCOUNTANT" || role === "BRANCH_MANAGER")
    return (
      <>
        <div className="mb-6 empty:hidden">
          <SetupBanner />
        </div>
        {role === "BRANCH_MANAGER" ? <BranchHome /> : role === "ACCOUNTANT" ? <AccountantHome /> : <DirectorHome />}
      </>
    );
  return (
    <>
      <h1 className="text-page-title">{t("title")}</h1>
      <div className="mt-6 empty:hidden">
        <SetupBanner />
      </div>
      <div className="mt-6 rounded-card border border-border bg-surface">
        <EmptyState icon={Construction} title={t("placeholderTitle")} description={t("placeholderDescription")} />
      </div>
    </>
  );
}
