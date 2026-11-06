import { Suspense } from "react";
import { TripSheetPage } from "@/features/orders/trip-sheet-page";

export default function Page() {
  return (
    <Suspense>
      <TripSheetPage />
    </Suspense>
  );
}
