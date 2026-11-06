import { notFound } from "next/navigation";
import { UiKit } from "./ui-kit";

/**
 * Komponentlar koʻrgazmasi — faqat ishlab chiqishda (`MEDIX_UI_KIT=1 pnpm build`),
 * skrinshot orqali dizayn bilan solishtirish uchun. Productionda 404.
 */
export default function UiKitPage() {
  if (process.env.MEDIX_UI_KIT !== "1") notFound();
  return <UiKit />;
}
