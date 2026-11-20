// PIN qoidalari — sof funksiyalar (testlanadi). Saqlash: src/lib/pin-store.ts
export const PIN_LENGTH = 4;
export const PIN_MAX_ATTEMPTS = 5;

export type PinState = { failed: number };

/** Faqat raqam, uzunligi PIN_LENGTH dan oshmaydi. */
export function pushDigit(current: string, digit: string): string {
  if (!/^\d$/.test(digit) || current.length >= PIN_LENGTH) return current;
  return current + digit;
}

export function popDigit(current: string): string {
  return current.slice(0, -1);
}

export function isComplete(pin: string): boolean {
  return pin.length === PIN_LENGTH && /^\d+$/.test(pin);
}

/** Xato urinishdan keyingi holat: qolgan urinishlar va bloklanganmi (login/parol talab qilinadi). */
export function afterFailure(state: PinState): { state: PinState; left: number; locked: boolean } {
  const failed = state.failed + 1;
  const left = Math.max(0, PIN_MAX_ATTEMPTS - failed);
  return { state: { failed }, left, locked: left === 0 };
}

/** PIN qurilmaga bogʻlangan tuz bilan xeshlanadi — PIN ochiq holda saqlanmaydi. */
export function pinMaterial(pin: string, salt: string): string {
  return `yuzplus-pin:v1:${salt}:${pin}`;
}
