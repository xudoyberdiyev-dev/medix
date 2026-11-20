import Constants from "expo-constants";
import { Platform } from "react-native";
import { api, ApiError } from "./api";
import { loginErrorKind, type LoginErrorKind } from "./api-errors";
import { clearPin } from "./pin-store";
import { clearSession, getToken, saveSession, type Me } from "./session";

// Mobil kirish (M2): POST /api/mobile/auth/login → qurilma tokeni (faqat haydovchi). Keyin ilovada PIN.
export type { LoginErrorKind };

export class LoginError extends Error {
  /** Server matni (masalan, «Qolgan urinishlar: 3») — boʻlsa, shu koʻrsatiladi. */
  constructor(
    readonly kind: LoginErrorKind,
    readonly detail?: string,
  ) {
    super(kind);
  }
}

function deviceName(): string {
  const name = Constants.deviceName ?? "Telefon";
  return `${name} · ${Platform.OS === "android" ? "Android" : Platform.OS} ${String(Platform.Version)}`.slice(0, 160);
}

export async function login(user: string, password: string): Promise<void> {
  try {
    const r = await api<{ token: string; me: Me }>("/api/mobile/auth/login", {
      method: "POST",
      auth: false,
      body: { login: user, password, device: deviceName() },
    });
    await saveSession(r.token, r.me);
  } catch (e) {
    if (e instanceof ApiError) {
      const kind = e.problem.status === 0 ? "network" : loginErrorKind(e.problem.status, e.problem.code);
      throw new LoginError(kind, kind === "credentials" || kind === "locked" ? e.problem.detail : undefined);
    }
    throw new LoginError("network");
  }
}

export async function hasSession(): Promise<boolean> {
  return (await getToken()) !== null;
}

/** Chiqish: server tokenni bekor qiladi (internet boʻlmasa ham telefondagi maʼlumot oʻchiriladi). */
export async function logout(): Promise<void> {
  try {
    await api("/api/mobile/auth/logout", { method: "POST" });
  } catch {
    // tarmoq yoʻq yoki token allaqachon yaroqsiz — baribir mahalliy tozalaymiz
  }
  await clearSession();
  await clearPin();
}
