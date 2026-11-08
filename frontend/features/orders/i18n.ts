import type { useTranslations } from "next-intl";

/** «orders» lugʻati tarjimoni — komponent boʻlmagan yordamchi funksiyalarga uzatiladi (testda `createTranslator`). */
export type OrdersT = ReturnType<typeof useTranslations<"orders">>;
