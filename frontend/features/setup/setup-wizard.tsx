"use client";

import { ArrowLeft, Lock } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, KpiCard } from "@/components/ui/card";
import { Stepper } from "@/components/ui/stepper";
import { EmptyState, ErrorState, ForbiddenState, Skeleton } from "@/components/ui/system-states";
import { toast } from "@/components/ui/toast";
import { useMe } from "@/features/auth/session";
import { ApiError } from "@/lib/api/client";
import { formatQuantity } from "@/lib/format";
import { firstIncompleteStep, useCompleteSetup, useSetupStatus, type SetupStatus } from "./api";
import { describeError } from "./form-error";
import { BranchesStep, CompanyStep, EmployeesStep, RolesStep, WarehousesStep } from "./steps";

export const SETUP_STEPS = [
  { key: "company", label: "Kompaniya" },
  { key: "branches", label: "Filiallar" },
  { key: "warehouses", label: "Omborlar va zonalar" },
  { key: "roles", label: "Rollar" },
  { key: "employees", label: "Xodimlar" },
  { key: "finish", label: "Yakun" },
];

/** Keyingi qadamga oʻtish mumkinmi (oldingi qadamlar bajarilgan). */
export function canLeaveStep(step: number, s: SetupStatus): boolean {
  if (step === 0) return Boolean(s.company);
  if (step === 1) return s.branches.length > 0;
  if (step === 2) return s.branches.every((b) => s.warehouses.some((w) => w.branchId === b.id));
  return true;
}

export function SetupWizard() {
  const me = useMe();
  const status = useSetupStatus();
  const [step, setStep] = useState<number | null>(null);

  if (status.error instanceof ApiError && status.error.isForbidden) {
    return (
      <Card flush>
        <ForbiddenState description="Sozlash ustasini faqat Direktor (CEO) bajaradi." />
      </Card>
    );
  }
  if (status.error) {
    return (
      <Card flush>
        <ErrorState onRetry={() => status.refetch()} />
      </Card>
    );
  }
  if (!status.data || !me.data) {
    return (
      <div className="flex flex-col gap-4" aria-busy="true">
        <Skeleton className="h-7 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const s = status.data;
  if (s.completed) {
    return (
      <Card flush>
        <EmptyState
          icon={Lock}
          title="Sozlash ustasi yakunlangan"
          description="Filial, ombor va xodimlarni endi «Sozlamalar» boʻlimida oʻzgartirasiz."
        />
      </Card>
    );
  }

  const current = step ?? firstIncompleteStep(s);
  const next = () => setStep(Math.min(current + 1, SETUP_STEPS.length - 1));

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <Stepper steps={SETUP_STEPS} current={current} onStepClick={setStep} />
      </Card>

      {current === 0 ? <CompanyStep status={s} onDone={next} /> : null}
      {current === 1 ? <BranchesStep status={s} /> : null}
      {current === 2 ? <WarehousesStep status={s} /> : null}
      {current === 3 ? <RolesStep /> : null}
      {current === 4 ? <EmployeesStep status={s} /> : null}
      {current === 5 ? <FinishStep status={s} /> : null}

      {current > 0 && current < 5 ? (
        <div className="flex items-center justify-between">
          <Button variant="tertiary" icon={ArrowLeft} onClick={() => setStep(current - 1)}>
            Ortga
          </Button>
          <Button size="lg" disabled={!canLeaveStep(current, s)} onClick={next}>
            Davom etish
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function FinishStep({ status }: { status: SetupStatus }) {
  const router = useRouter();
  const complete = useCompleteSetup();
  const err = describeError(complete.error);
  const zones = status.warehouses.reduce((n, w) => n + w.zones.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-4">
        <KpiCard label="Filiallar" value={formatQuantity(status.branches.length)} unit="ta" />
        <KpiCard label="Omborlar" value={formatQuantity(status.warehouses.length)} unit="ta" note={`${formatQuantity(zones)} ta zona`} />
        <KpiCard label="Xodimlar" value={formatQuantity(status.employees.length)} unit="ta" />
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
                toast({ tone: "success", title: "Sozlash yakunlandi", description: "Tizim ishga tayyor." });
                router.replace("/");
              },
            })
          }
        >
          Ustani yakunlash
        </Button>
      </div>
    </div>
  );
}
