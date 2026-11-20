import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { afterFailure, pinMaterial } from "./pin";

const K = { hash: "yuzplus.pin.hash", salt: "yuzplus.pin.salt", failed: "yuzplus.pin.failed" } as const;

async function digest(pin: string, salt: string): Promise<string> {
  return Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, pinMaterial(pin, salt));
}

export async function hasPin(): Promise<boolean> {
  return (await SecureStore.getItemAsync(K.hash)) !== null;
}

export async function savePin(pin: string): Promise<void> {
  const salt = Crypto.randomUUID();
  await SecureStore.setItemAsync(K.salt, salt);
  await SecureStore.setItemAsync(K.hash, await digest(pin, salt));
  await SecureStore.setItemAsync(K.failed, "0");
}

export type PinCheck = { ok: true } | { ok: false; left: number; locked: boolean };

export async function checkPin(pin: string): Promise<PinCheck> {
  const [hash, salt, failedRaw] = await Promise.all([
    SecureStore.getItemAsync(K.hash),
    SecureStore.getItemAsync(K.salt),
    SecureStore.getItemAsync(K.failed),
  ]);
  if (!hash || !salt) return { ok: false, left: 0, locked: true };
  if ((await digest(pin, salt)) === hash) {
    await SecureStore.setItemAsync(K.failed, "0");
    return { ok: true };
  }
  const next = afterFailure({ failed: Number(failedRaw ?? "0") || 0 });
  await SecureStore.setItemAsync(K.failed, String(next.state.failed));
  if (next.locked) await clearPin();
  return { ok: false, left: next.left, locked: next.locked };
}

export async function clearPin(): Promise<void> {
  await Promise.all(Object.values(K).map((k) => SecureStore.deleteItemAsync(k)));
}
