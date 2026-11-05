import { Suspense } from "react";
import { PriceChangePrintPage } from "@/features/prices/price-change-print-page";

export default function Page() {
  return (
    <Suspense>
      <PriceChangePrintPage />
    </Suspense>
  );
}
