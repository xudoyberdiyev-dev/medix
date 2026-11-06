import { Suspense } from "react";
import { CashOrderPage } from "@/features/cash/cash-order-page";

export default function Page() {
  return (
    <Suspense>
      <CashOrderPage />
    </Suspense>
  );
}
