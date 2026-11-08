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
  // Bosh sahifa turi rol sozlamasidan (Rollar matritsasi → «Bosh sahifa»); nusxa rollar ham shunga ergashadi
  const home = me.data?.role.home;
  if (home === "cashier") return <CashierPanel />;
  // Prototip: ombor rollari uchun bosh sahifa — oʻz paneli
  if (home === "keeper") return <MonitorPage />;
  if (home === "picker") return <PickingPage />;
  if (home === "marker") return <MarkingPage />;
  if (home === "driver") return <DriverPage />;
  if (home === "operator" || home === "purchase")
    return (
      <>
        <div className="mb-6 empty:hidden">
          <SetupBanner />
        </div>
        {home === "operator" ? <OperatorHome /> : <PurchaserHome />}
      </>
    );
  if (home === "director" || home === "accountant" || home === "branch")
    return (
      <>
        <div className="mb-6 empty:hidden">
          <SetupBanner />
        </div>
        {home === "branch" ? <BranchHome /> : home === "accountant" ? <AccountantHome /> : <DirectorHome />}
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
