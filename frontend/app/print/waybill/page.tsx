import { Suspense } from "react";
import { WaybillPage } from "@/features/orders/waybill-page";

export default function Page() {
  return (
    <Suspense>
      <WaybillPage />
    </Suspense>
  );
}
