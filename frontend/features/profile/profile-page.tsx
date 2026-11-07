"use client";

import { CircleCheck, KeyRound, ShieldAlert } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { useChangePassword } from "@/features/auth/session";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime } from "@/lib/format";
import { useProfile, useSetPin, useUpdatePhone, validatePin, type Profile } from "./api";

export function ProfilePage() {
  const profile = useProfile();
  if (profile.error) return <ErrorState onRetry={() => profile.refetch()} />;
  if (!profile.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  return (
    <>
      <h1 className="mb-6 text-page-title">Profil</h1>
      <div className="grid max-w-5xl grid-cols-1 gap-4 lg:grid-cols-2">
        <InfoCard profile={profile.data} />
        <PinCard profile={profile.data} />
        <PasswordCard />
        <LanguageCard />
      </div>
    </>
  );
}

function LanguageCard() {
  const t = useTranslations("language");
  return (
    <Card title={t("label")}>
      <LanguageSwitcher className="max-w-xs" />
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex gap-4 py-2">
      <dt className="w-36 shrink-0 text-text-secondary">{label}</dt>
      <dd className="min-w-0 flex-1">{children}</dd>
    </div>
  );
}

function InfoCard({ profile }: { profile: Profile }) {
  const update = useUpdatePhone();
  const [phone, setPhone] = useState(profile.phone ?? "");
  const err = describeError(update.error);
  const changed = phone.trim() !== (profile.phone ?? "");
  return (
    <Card title="Maʼlumotlarim">
      <dl className="divide-y divide-border">
        <Row label="F.I.Sh.">{profile.fullName}</Row>
        <Row label="Login">
          <span className="font-mono">{profile.login}</span>
        </Row>
        <Row label="Rol">{profile.roleName}</Row>
        <Row label="Filial">{profile.branchName ?? "Barcha filiallar"}</Row>
        {profile.position ? <Row label="Lavozim">{profile.position}</Row> : null}
        <Row label="Oxirgi kirish">{profile.lastLoginAt ? formatDateTime(new Date(profile.lastLoginAt)) : "—"}</Row>
      </dl>
      <p className="mt-2 text-caption text-text-secondary">Ism, rol va filialni administrator oʻzgartiradi.</p>
      <form
        className="mt-4 flex items-start gap-3"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          update.mutate(phone, { onSuccess: () => toast({ tone: "success", title: "Telefon raqami saqlandi" }) });
        }}
      >
        <div className="flex-1">
          <TextField
            label="Telefon"
            value={phone}
            onChange={setPhone}
            error={err.fields.phone ?? err.message ?? undefined}
            placeholder="+998 90 123 45 67"
          />
        </div>
        <Button type="submit" variant="secondary" className="mt-6" disabled={!changed} loading={update.isPending}>
          Telefonni saqlash
        </Button>
      </form>
    </Card>
  );
}

function PinCard({ profile }: { profile: Profile }) {
  const setPin = useSetPin();
  const [form, setForm] = useState({ currentPassword: "", pin: "", repeat: "" });
  const [errors, setErrors] = useState<{ pin?: string; repeat?: string }>({});
  const err = describeError(setPin.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validatePin(form.pin, form.repeat);
    setErrors(v);
    if (v.pin || v.repeat) return;
    setPin.mutate(
      { currentPassword: form.currentPassword, pin: form.pin },
      {
        onSuccess: () => (
          toast({ tone: "success", title: profile.pinSet ? "PIN almashtirildi" : "PIN oʻrnatildi" }),
          setForm({ currentPassword: "", pin: "", repeat: "" })
        ),
      },
    );
  }

  return (
    <Card
      title="PIN"
      actions={
        profile.pinSet ? (
          <Badge tone="success" icon={CircleCheck}>
            Oʻrnatilgan
          </Badge>
        ) : (
          <Badge tone="warning" icon={ShieldAlert}>
            Oʻrnatilmagan
          </Badge>
        )
      }
    >
      <p className="mb-4 text-text-secondary">
        PIN — rahbar tasdiqlari va kassa farqi uchun ikkinchi tasdiq. 5 marta xato kiritilsa, 15 daqiqaga qulflanadi.
        {profile.pinSetAt ? ` Oxirgi oʻzgarish: ${formatDateTime(new Date(profile.pinSetAt))}.` : ""}
      </p>
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label="Joriy parol"
          variant="password"
          value={form.currentPassword}
          onChange={set("currentPassword")}
          error={err.fields.currentPassword}
          autoComplete="current-password"
          required
          className="col-span-2"
        />
        <TextField
          label={profile.pinSet ? "Yangi PIN" : "PIN"}
          variant="password"
          inputMode="numeric"
          maxLength={6}
          value={form.pin}
          onChange={set("pin")}
          error={errors.pin ?? err.fields.pin}
          hint="4–6 raqam"
          autoComplete="off"
          required
        />
        <TextField
          label="PIN takrori"
          variant="password"
          inputMode="numeric"
          maxLength={6}
          value={form.repeat}
          onChange={set("repeat")}
          error={errors.repeat}
          autoComplete="off"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
        <div className="col-span-2 flex justify-end">
          <Button type="submit" icon={KeyRound} loading={setPin.isPending}>
            {profile.pinSet ? "PIN ni almashtirish" : "PIN oʻrnatish"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [repeatError, setRepeatError] = useState<string>();
  const err = describeError(change.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.repeat) return setRepeatError("Parol takrori mos kelmadi. Qaytadan kiriting.");
    setRepeatError(undefined);
    change.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      {
        onSuccess: () => (
          toast({ tone: "success", title: "Parol almashtirildi" }),
          setForm({ currentPassword: "", newPassword: "", repeat: "" })
        ),
      },
    );
  }

  return (
    <Card title="Parol">
      <form onSubmit={submit} noValidate className="grid grid-cols-2 gap-4">
        <TextField
          label="Joriy parol"
          variant="password"
          value={form.currentPassword}
          onChange={set("currentPassword")}
          error={err.fields.currentPassword}
          autoComplete="current-password"
          required
          className="col-span-2"
        />
        <TextField
          label="Yangi parol"
          variant="password"
          value={form.newPassword}
          onChange={set("newPassword")}
          error={err.fields.newPassword}
          hint="Kamida 8 belgi"
          autoComplete="new-password"
          required
        />
        <TextField
          label="Parol takrori"
          variant="password"
          value={form.repeat}
          onChange={set("repeat")}
          error={repeatError}
          autoComplete="new-password"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} className="col-span-2" /> : null}
        <div className="col-span-2 flex justify-end">
          <Button type="submit" variant="secondary" loading={change.isPending}>
            Parolni almashtirish
          </Button>
        </div>
      </form>
    </Card>
  );
}
