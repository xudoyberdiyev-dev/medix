import { Suspense } from "react";
import { PickSheetPage } from "@/features/orders/pick-sheet-page";

export default function Page() {
  return (
    <Suspense>
      <PickSheetPage />
    </Suspense>
  );
}
