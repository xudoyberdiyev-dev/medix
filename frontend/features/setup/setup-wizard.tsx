"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { useMe } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { firstIncompleteStep, useSetupStatus, type SetupStatus } from "./api";
import { CompanyStep } from "./company-step";
import { BranchesStep } from "./branches-step";
import { StaffManager } from "@/features/employees/staff-manager";
import { RolesMatrix } from "@/features/roles/roles-matrix";
import { FinishStep } from "./finish-step";
import { WarehousesStep } from "./warehouses-step";
import { SETUP_STEPS, WizardFrame } from "./wizard-frame";

export { SETUP_STEPS };

/** Keyingi qadamga oʻtish mumkinmi (oldingi qadamlar bajarilgan). */
export function canLeaveStep(step: number, s: SetupStatus): boolean {
  if (step === 0) return Boolean(s.company);
  if (step === 1) return s.branches.length > 0;
  // Prototip: kamida bitta ombor; omborsiz filial boʻlsa — «Baribir davom etish» oynasi (yakunda ham ogohlantiriladi)
  if (step === 2) return s.warehouses.length > 0;
  return true;
}

export function SetupWizard() {
  const t = useTranslations("setup");
  const me = useMe();
  const status = useSetupStatus();

  if (status.error instanceof ApiError && status.error.isForbidden) {
    return (
      <Centered>
        <Card flush>
          <ForbiddenState description={t("forbidden")} />
        </Card>
      </Centered>
    );
  }
  if (status.error) {
    return (
      <Centered>
        <Card flush>
          <ErrorState onRetry={() => status.refetch()} />
        </Card>
      </Centered>
    );
  }
  if (!status.data || !me.data) {
    return (
      <Centered>
        <div className="flex flex-col gap-4" aria-busy="true">
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </Centered>
    );
  }

  const s = status.data;
  if (s.completed) {
    return (
      <Centered>
        <Card flush>
          <EmptyState icon={Lock} title={t("completedTitle")} description={t("completedDescription")} />
        </Card>
      </Centered>
    );
  }

  return <WizardSteps status={s} />;
}

/**
 * Boshlangʻich qadam faqat birinchi yuklanishda aniqlanadi (birinchi tugallanmagan qadam). Keyin qadam faqat
 * foydalanuvchi tugmasi bilan oʻzgaradi — avtomatik saqlash holatni yangilaganda usta oʻzi keyingi qadamga sakramaydi.
 */
function WizardSteps({ status: s }: { status: SetupStatus }) {
  const ts = useTranslations("setup");
  const [current, setStep] = useState(() => firstIncompleteStep(s));
  const go = (i: number) => setStep(Math.max(0, Math.min(i, SETUP_STEPS.length - 1)));
  // Qadamga faqat oldingilari bajarilgan boʻlsa oʻtiladi
  const reachable = (i: number) => Array.from({ length: i }, (_, k) => k).every((k) => canLeaveStep(k, s));
  const nav = { step: current, reachable, onStep: go };

  if (current === 0) return <CompanyStep status={s} nav={nav} onDone={() => go(1)} />;
  if (current === 1) return <BranchesStep status={s} nav={nav} onBack={() => go(0)} onDone={() => go(2)} />;
  if (current === 2) return <WarehousesStep status={s} nav={nav} onBack={() => go(1)} onDone={() => go(3)} />;
  if (current === 3)
    return (
      <WizardFrame {...nav} wide>
        <RolesMatrix mode="wizard" onSaved={() => go(4)} />
      </WizardFrame>
    );
  if (current === 4) return <StaffStep status={s} nav={nav} onBack={() => go(3)} onDone={() => go(5)} />;
  return (
    <WizardFrame {...nav} wide>
      <FinishStep status={s} stepOf={ts("stepOf", { n: 6, total: 6 })} onGo={go} onBack={() => go(4)} />
    </WizardFrame>
  );
  return null;
}

function StaffStep({
  status: s,
  nav,
  onBack,
  onDone,
}: {
  status: SetupStatus;
  nav: { step: number; reachable: (i: number) => boolean; onStep: (i: number) => void };
  onBack: () => void;
  onDone: () => void;
}) {
  const ts = useTranslations("setup");
  return (
    <WizardFrame {...nav} wide>
      <StaffManager
        branches={s.branches.map((b) => ({ id: b.id, name: b.name }))}
        warehouses={s.warehouses.map((w) => ({ id: w.id, branchId: w.branchId, name: w.name }))}
        stepOf={ts("stepOf", { n: 5, total: 6 })}
        onBack={onBack}
        onNext={onDone}
      />
    </WizardFrame>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[720px] px-[24px] py-[64px]">{children}</main>;
}
