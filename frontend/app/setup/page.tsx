import { SetupWizard } from "@/features/setup/setup-wizard";

export default function SetupPage() {
  return (
    <>
      <h1 className="mb-1 text-page-title">Tizimni sozlash</h1>
      <p className="mb-6 text-text-secondary">Kompaniya, filiallar, omborlar va xodimlarni kiriting. Har qadam darhol saqlanadi.</p>
      <SetupWizard />
    </>
  );
}
