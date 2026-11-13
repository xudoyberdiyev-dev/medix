"use client";

import { ArrowUpRight, CircleAlert, CircleCheck, Grid3x3, Info, KeyRound, Monitor, Pencil, Smartphone } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { LanguageRadios } from "@/components/shell/language-switcher";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Drawer } from "@/components/ui/drawer";
import { Modal } from "@/components/ui/modal";
import { ErrorState, Skeleton } from "@/components/ui/system-states";
import { TextField } from "@/components/ui/text-field";
import { toast } from "@/components/ui/toast";
import { can } from "@/features/auth/can";
import { useChangePassword, useMe } from "@/features/auth/session";
import { ACT, isObjectType } from "@/features/audit/audit-page";
import { describeError } from "@/features/setup/form-error";
import { formatDateTime } from "@/lib/format";
import { formatIsoDate, todayTashkent } from "@/features/counterparties/api";
import { cleanLogin, formatPhone } from "@/features/employees/staff";
import {
  checkProfile,
  describeDevice,
  profileForm,
  useEndOtherSessions,
  useMyActions,
  useMySessions,
  useProfile,
  useSetPin,
  useUpdateProfile,
  validatePin,
  type Profile,
  type ProfileErrorKey,
  type ProfileForm,
} from "./api";

/** Profil (prototip Profile): chapda Maʼlumotlarim, Til, Parol, PIN; oʻngda Faol sessiyalar va Mening harakatlarim. */
export function ProfilePage() {
  const t = useTranslations("profile");
  const profile = useProfile();
  if (profile.error) return <ErrorState error={profile.error} onRetry={() => profile.refetch()} />;
  if (!profile.data)
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  const p = profile.data;
  return (
    <>
      <div className="mb-6">
        <h1 className="text-page-title">{t("title")}</h1>
        <p className="text-caption text-text-secondary">
          {p.fullName} · {p.roleName}
        </p>
      </div>
      <div className="grid max-w-6xl grid-cols-1 items-start gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <InfoCard profile={p} />
          <LanguageCard />
          <PasswordCard profile={p} />
          <PinCard profile={p} />
        </div>
        <div className="flex flex-col gap-4">
          <SessionsCard />
          <ActionsCard />
        </div>
      </div>
    </>
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
  const t = useTranslations("profile.info");
  const [open, setOpen] = useState(false);
  const fio = [profile.lastName, profile.firstName, profile.middleName].filter(Boolean).join(" ") || profile.fullName;
  return (
    <Card
      title={t("title")}
      actions={
        <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setOpen(true)}>
          {t("edit")}
        </Button>
      }
    >
      <dl className="divide-y divide-border">
        <Row label={t("fullName")}>{fio}</Row>
        <Row label={t("role")}>{profile.roleName}</Row>
        <Row label={t("branch")}>{profile.branchName ?? t("allBranches")}</Row>
        <Row label={t("login")}>
          <span className="font-mono">{profile.login}</span>
        </Row>
        <Row label={t("phone")}>
          <span className="font-mono">{profile.phone ?? "—"}</span>
        </Row>
        <Row label={t("email")}>{profile.email ?? "—"}</Row>
        <Row label={t("position")}>{profile.position ?? "—"}</Row>
        <Row label={t("birthDate")}>{profile.birthDate ? formatIsoDate(profile.birthDate) : "—"}</Row>
        <Row label={t("lastLogin")}>{profile.lastLoginAt ? formatDateTime(new Date(profile.lastLoginAt)) : "—"}</Row>
      </dl>
      <p className="mt-2 flex items-center gap-1.5 text-caption text-text-secondary">
        <Info size={14} strokeWidth={1.5} aria-hidden /> {t("adminEdits")}
      </p>
      {open ? <InfoDrawer profile={profile} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

/** Oʻz maʼlumotlarini tahrirlash (egasi 13.11, O0): rol va filial bu yerda oʻzgarmaydi. */
function InfoDrawer({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const t = useTranslations("profile.info");
  const save = useUpdateProfile();
  const [form, setForm] = useState<ProfileForm>(() => profileForm(profile));
  const [tried, setTried] = useState(false);
  const errs = tried ? checkProfile(form, todayTashkent()) : [];
  const server = describeError(save.error);
  const set = (k: keyof ProfileForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const fe = (k: ProfileErrorKey, field: string) => (errs.includes(k) ? t(`errors.${k}`) : server.fields[field]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setTried(true);
    if (checkProfile(form, todayTashkent()).length) return;
    save.mutate(form, { onSuccess: () => (toast({ tone: "success", title: t("saved") }), onClose()) });
  }

  return (
    <Drawer open onClose={onClose} title={t("editTitle")}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        {server.message ? <Alert tone="danger" title={server.message} /> : null}
        <TextField label={t("lastName")} value={form.last} onChange={set("last")} error={fe("last", "lastName")} required />
        <TextField label={t("firstName")} value={form.first} onChange={set("first")} error={fe("first", "firstName")} required />
        <TextField label={t("middleName")} value={form.mid} onChange={set("mid")} error={server.fields.middleName} />
        <TextField
          label={t("login")}
          value={form.login}
          onChange={(v) => set("login")(cleanLogin(v))}
          error={fe("login", "login")}
          hint={t("loginHint")}
          autoComplete="username"
          required
        />
        <TextField
          label={t("phone")}
          value={form.phone}
          onChange={(v) => set("phone")(v.trim() ? formatPhone(v) : "")}
          error={fe("phone", "phone")}
          placeholder="+998 90 123 45 67"
          inputMode="tel"
        />
        <TextField
          label={t("email")}
          value={form.email}
          onChange={set("email")}
          error={fe("email", "email")}
          placeholder="ism@kompaniya.uz"
          inputMode="email"
          autoComplete="email"
        />
        <TextField label={t("position")} value={form.position} onChange={set("position")} error={server.fields.position} />
        <TextField
          variant="date"
          label={t("birthDate")}
          value={form.birth}
          onChange={set("birth")}
          error={fe("birth", "birthDate")}
          placeholder="21.03.1985"
          inputMode="numeric"
        />
        <p className="flex items-center gap-1.5 text-caption text-text-secondary">
          <Info size={14} strokeWidth={1.5} aria-hidden /> {t("roleNote")}
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={save.isPending}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function LanguageCard() {
  const t = useTranslations("profile");
  const tl = useTranslations("language");
  return (
    <Card title={tl("label")}>
      <LanguageRadios />
      <p className="mt-2 text-caption text-text-secondary">{t("languageNote")}</p>
    </Card>
  );
}

/** Sarlavha + holat satri + amal tugmasi (prototip: Parol, PIN boʻlimlari). */
function ActionSection({ title, meta, action }: { title: string; meta: ReactNode; action: ReactNode }) {
  return (
    <section className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface px-6 py-5">
      <div className="flex min-w-0 flex-col">
        <h2 className="text-subtitle">{title}</h2>
        <span className="text-caption text-text-secondary">{meta}</span>
      </div>
      {action}
    </section>
  );
}

function PasswordCard({ profile }: { profile: Profile }) {
  const t = useTranslations("profile.password");
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionSection
        title={t("title")}
        meta={profile.passwordChangedAt ? t("changedAt", { date: formatDateTime(new Date(profile.passwordChangedAt)) }) : t("hint")}
        action={
          <Button variant="secondary" icon={KeyRound} onClick={() => setOpen(true)}>
            {t("change")}
          </Button>
        }
      />
      {open ? <PasswordDrawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PasswordDrawer({ onClose }: { onClose: () => void }) {
  const t = useTranslations("profile.password");
  const change = useChangePassword();
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", repeat: "" });
  const [repeatError, setRepeatError] = useState<string>();
  const err = describeError(change.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    if (form.newPassword !== form.repeat) return setRepeatError(t("mismatch"));
    setRepeatError(undefined);
    change.mutate(
      { currentPassword: form.currentPassword, newPassword: form.newPassword },
      { onSuccess: () => (toast({ tone: "success", title: t("changed") }), onClose()) },
    );
  }

  return (
    <Drawer open onClose={onClose} title={t("change")}>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t("current")}
          variant="password"
          value={form.currentPassword}
          onChange={set("currentPassword")}
          error={err.fields.currentPassword}
          autoComplete="current-password"
          required
        />
        <TextField
          label={t("new")}
          variant="password"
          value={form.newPassword}
          onChange={set("newPassword")}
          error={err.fields.newPassword}
          hint={t("newHint")}
          autoComplete="new-password"
          required
        />
        <TextField
          label={t("repeat")}
          variant="password"
          value={form.repeat}
          onChange={set("repeat")}
          error={repeatError}
          autoComplete="new-password"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        <div className="flex justify-end">
          <Button type="submit" loading={change.isPending}>
            {t("change")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function PinCard({ profile }: { profile: Profile }) {
  const t = useTranslations("profile.pin");
  const [open, setOpen] = useState(false);
  return (
    <>
      <ActionSection
        title={t("title")}
        meta={
          profile.pinSet ? (
            <span className="inline-flex items-center gap-1.5 text-success">
              <CircleCheck size={14} strokeWidth={1.5} aria-hidden />
              {profile.pinSetAt ? t("isSetOn", { date: formatDateTime(new Date(profile.pinSetAt)) }) : t("isSet")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-warning">
              <CircleAlert size={14} strokeWidth={1.5} aria-hidden /> {t("notSet")}
            </span>
          )
        }
        action={
          <Button variant="secondary" icon={Grid3x3} onClick={() => setOpen(true)}>
            {profile.pinSet ? t("change") : t("setAction")}
          </Button>
        }
      />
      {open ? <PinDrawer profile={profile} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PinDrawer({ profile, onClose }: { profile: Profile; onClose: () => void }) {
  const t = useTranslations("profile.pin");
  const setPin = useSetPin();
  const [form, setForm] = useState({ currentPassword: "", pin: "", repeat: "" });
  const [errors, setErrors] = useState<{ pin?: string; repeat?: string }>({});
  const err = describeError(setPin.error);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const v = validatePin(form.pin, form.repeat);
    setErrors({ pin: v.pin && t(`errors.${v.pin}`), repeat: v.repeat && t(`errors.${v.repeat}`) });
    if (v.pin || v.repeat) return;
    setPin.mutate(
      { currentPassword: form.currentPassword, pin: form.pin },
      { onSuccess: () => (toast({ tone: "success", title: profile.pinSet ? t("changed") : t("set") }), onClose()) },
    );
  }

  return (
    <Drawer open onClose={onClose} title={profile.pinSet ? t("change") : t("setAction")}>
      <p className="mb-4 text-text-secondary">{t("about")}</p>
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <TextField
          label={t("currentPassword")}
          variant="password"
          value={form.currentPassword}
          onChange={set("currentPassword")}
          error={err.fields.currentPassword}
          autoComplete="current-password"
          required
        />
        <TextField
          label={profile.pinSet ? t("newPin") : t("pin")}
          variant="password"
          inputMode="numeric"
          maxLength={6}
          value={form.pin}
          onChange={set("pin")}
          error={errors.pin ?? err.fields.pin}
          hint={t("pinHint")}
          autoComplete="off"
          required
        />
        <TextField
          label={t("repeat")}
          variant="password"
          inputMode="numeric"
          maxLength={6}
          value={form.repeat}
          onChange={set("repeat")}
          error={errors.repeat}
          autoComplete="off"
          required
        />
        {err.message ? <Alert tone="danger" title={err.message} /> : null}
        <div className="flex justify-end">
          <Button type="submit" icon={KeyRound} loading={setPin.isPending}>
            {profile.pinSet ? t("change") : t("setAction")}
          </Button>
        </div>
      </form>
    </Drawer>
  );
}

function SessionsCard() {
  const t = useTranslations("profile.sessions");
  const sessions = useMySessions();
  const end = useEndOtherSessions();
  const [confirm, setConfirm] = useState(false);
  const list = sessions.data ?? [];
  const others = list.filter((s) => !s.current).length;
  return (
    <Card
      title={t("title")}
      flush
      actions={
        others > 0 ? (
          <button type="button" onClick={() => setConfirm(true)} className="text-caption font-medium text-danger hover:underline">
            {t("endOthers")}
          </button>
        ) : null
      }
    >
      {sessions.isError ? (
        <ErrorState onRetry={() => void sessions.refetch()} />
      ) : !sessions.data ? (
        <div className="p-5">
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {list.map((s, i) => {
            const d = describeDevice(s.device);
            const Icon = d.mobile ? Smartphone : Monitor;
            return (
              <li key={i} className="flex items-center gap-3 px-5 py-3">
                <span className="flex size-8 flex-none items-center justify-center rounded-lg bg-background text-text-secondary">
                  <Icon size={16} strokeWidth={1.5} aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex items-center gap-2 text-body font-medium">
                    {d.os ?? t("unknownDevice")}
                    {s.current ? (
                      <span className="rounded-md bg-primary-soft px-1.5 text-caption font-medium text-primary">{t("thisDevice")}</span>
                    ) : null}
                  </span>
                  <span className="truncate text-caption text-text-secondary">
                    {d.browser ?? t("unknownBrowser")} · <span className="font-mono">{s.ip ?? "—"}</span>
                  </span>
                </div>
                <span className="flex-none text-caption text-text-secondary">
                  {s.current ? t("now") : formatDateTime(new Date(s.lastAccessAt))}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <Modal
        open={confirm}
        onClose={() => setConfirm(false)}
        title={t("confirmTitle")}
        tone="danger"
        primaryAction={{
          label: t("confirm"),
          loading: end.isPending,
          onClick: () =>
            end.mutate(undefined, {
              onSuccess: (r) => (setConfirm(false), toast({ tone: "success", title: t("ended", { n: r.ended }) })),
              onError: (e) => toast({ tone: "danger", title: describeError(e).message ?? t("title") }),
            }),
        }}
        secondaryAction={{ label: t("cancel"), onClick: () => setConfirm(false) }}
      >
        {t("confirmText", { n: others })}
      </Modal>
    </Card>
  );
}

function ActionsCard() {
  const t = useTranslations("profile.actions");
  const ta = useTranslations("audit");
  const me = useMe();
  const actions = useMyActions();
  return (
    <Card
      title={t("title")}
      flush
      actions={
        can(me.data, "audit.view") ? (
          <Link
            href="/settings/audit"
            className="flex items-center gap-1 text-caption font-medium text-text-secondary hover:text-primary hover:underline"
          >
            {t("seeAll")} <ArrowUpRight size={14} strokeWidth={1.5} aria-hidden />
          </Link>
        ) : null
      }
    >
      {actions.isError ? (
        <ErrorState onRetry={() => void actions.refetch()} />
      ) : !actions.data ? (
        <div className="p-5">
          <Skeleton className="h-12 w-full" />
        </div>
      ) : actions.data.length === 0 ? (
        <p className="px-5 py-6 text-center text-caption text-text-secondary">{t("empty")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {actions.data.map((a) => {
            const Icon = ACT[a.category].icon;
            const object =
              a.objectLabel ??
              `${isObjectType(a.entityType) ? ta(`ot.${a.entityType}`) : a.entityType}${a.entityId ? ` #${a.entityId}` : ""}`;
            return (
              <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                <Icon size={15} strokeWidth={1.5} aria-hidden className={`mt-0.5 flex-none ${ACT[a.category].className}`} />
                <div className="flex min-w-0 flex-col">
                  <span className="text-body">
                    <b className="font-medium">{ta(`act.${a.category}`)}</b> · {object}
                  </span>
                  <span className="text-caption text-text-secondary">{formatDateTime(new Date(a.occurredAt))}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
