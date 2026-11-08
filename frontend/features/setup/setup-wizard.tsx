"use client";

import { Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, KpiCard } from "@/components/ui/card";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { formatQuantity } from "@/lib/format";
import { firstIncompleteStep, useCompleteSetup, useSetupStatus, type SetupStatus } from "./api";
import { describeError } from "./form-error";
import { CompanyStep } from "./company-step";
import { BranchesStep, EmployeesStep, RolesStep, WarehousesStep } from "./steps";
import { SETUP_STEPS, WizardFrame } from "./wizard-frame";

export { SETUP_STEPS };

/** Keyingi qadamga oʻtish mumkinmi (oldingi qadamlar bajarilgan). */
export function canLeaveStep(step: number, s: SetupStatus): boolean {
  if (step === 0) return Boolean(s.company);
  if (step === 1) return s.branches.length > 0;
  if (step === 2) return s.branches.every((b) => s.warehouses.some((w) => w.branchId === b.id));
  return true;
}

export function SetupWizard() {
  const t = useTranslations("setup");
  const me = useMe();
  const status = useSetupStatus();
  const [step, setStep] = useState<number | null>(null);

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

  const current = step ?? firstIncompleteStep(s);
  const go = (i: number) => setStep(Math.max(0, Math.min(i, SETUP_STEPS.length - 1)));
  // Qadamga faqat oldingilari bajarilgan boʻlsa oʻtiladi
  const reachable = (i: number) => Array.from({ length: i }, (_, k) => k).every((k) => canLeaveStep(k, s));
  const nav = { step: current, reachable, onStep: go };

  if (current === 0) return <CompanyStep status={s} nav={nav} onDone={() => go(1)} />;

  return (
    <WizardFrame
      {...nav}
      onBack={() => go(current - 1)}
      onNext={current < SETUP_STEPS.length - 1 ? () => go(current + 1) : undefined}
      nextDisabled={!canLeaveStep(current, s)}
    >
      {current === 1 ? <BranchesStep status={s} /> : null}
      {current === 2 ? <WarehousesStep status={s} /> : null}
      {current === 3 ? <RolesStep /> : null}
      {current === 4 ? <EmployeesStep status={s} /> : null}
      {current === 5 ? <FinishStep status={s} /> : null}
    </WizardFrame>
  );
}

function Centered({ children }: { children: ReactNode }) {
  return <main className="mx-auto max-w-[720px] px-[24px] py-[64px]">{children}</main>;
}

function FinishStep({ status }: { status: SetupStatus }) {
  const t = useTranslations("setup.finish");
  const router = useRouter();
  const complete = useCompleteSetup();
  const err = describeError(complete.error);
  const zones = status.warehouses.reduce((n, w) => n + w.zones.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <KpiCard label={t("branches")} value={formatQuantity(status.branches.length)} unit={t("unit")} />
        <KpiCard
          label={t("warehouses")}
          value={formatQuantity(status.warehouses.length)}
          unit={t("unit")}
          note={t("zones", { count: formatQuantity(zones) })}
        />
        <KpiCard label={t("employees")} value={formatQuantity(status.employees.length)} unit={t("unit")} />
      </div>
      {status.blockers.map((b) => (
        <Alert key={b} tone="warning" title={b} />
      ))}
      {err.message ? <Alert tone="danger" title={err.message} /> : null}
      <div className="flex justify-end">
        <Button
          size="lg"
          disabled={status.blockers.length > 0}
          loading={complete.isPending}
          onClick={() =>
            complete.mutate(undefined, {
              onSuccess: () => {
                toast({ tone: "success", title: t("done"), description: t("doneDescription") });
                router.replace("/");
              },
            })
          }
        >
          {t("complete")}
        </Button>
      </div>
    </div>
  );
}
