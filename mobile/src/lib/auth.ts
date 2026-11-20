// Mobil kirish. Backend qurilma tokeni (M2) hali yozilmagan — shu sabab login hozircha
// «serverga ulanib boʻlmadi» xatosini qaytaradi. M2 da: POST /api/mobile/auth → {token}, SecureStore.
export type LoginErrorKind = "credentials" | "role" | "network";

export class LoginError extends Error {
  constructor(readonly kind: LoginErrorKind) {
    super(kind);
  }
}

export async function login(_user: string, _password: string): Promise<void> {
  throw new LoginError("network");
}
