import * as SecureStore from "expo-secure-store";

// Qurilma tokeni va haydovchi maʼlumoti — faqat SecureStore'da (Android Keystore bilan shifrlangan).
const K = { token: "yuzplus.token", me: "yuzplus.me" } as const;

export type Me = {
  id: number;
  login: string;
  fullName: string;
  branchId?: number | null;
  role: { code: string; name: string };
};

export async function saveSession(token: string, me: Me): Promise<void> {
  await SecureStore.setItemAsync(K.token, token);
  await SecureStore.setItemAsync(K.me, JSON.stringify(me));
}

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(K.token);
}

export async function getMe(): Promise<Me | null> {
  const raw = await SecureStore.getItemAsync(K.me);
  return raw ? (JSON.parse(raw) as Me) : null;
}

export async function clearSession(): Promise<void> {
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k)));
}
