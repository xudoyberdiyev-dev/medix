/**
 * API xatosi. Backend RFC 9457 ProblemDetail qaytaradi: `detail` — foydalanuvchi tilidagi matn,
 * `code` — i18n kaliti (masalan `stock.insufficient`). Frontend matnni o'zi o'ylab topmaydi.
 */
export interface ProblemDetail {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  code?: string;
  errors?: Record<string, string>;
}

export const FALLBACK_ERROR = "Soʻrov bajarilmadi. Sahifani yangilab, qayta urinib koʻring.";
export const NETWORK_ERROR = "Server bilan aloqa yoʻq. Internetni tekshirib, qayta urinib koʻring.";

/** Hook boʻlmagan joyda (xato obyektlari) — interfeys tili `<html lang>` dan (IntlProvider oʻrnatadi). */
function byLang(texts: { "uz-Latn": string; "uz-Cyrl": string; ru: string }): string {
  const lang = typeof document === "undefined" ? "uz-Latn" : document.documentElement.lang;
  return lang === "ru" || lang === "uz-Cyrl" ? texts[lang] : texts["uz-Latn"];
}

export function fallbackErrorText(): string {
  return byLang({
    "uz-Latn": FALLBACK_ERROR,
    "uz-Cyrl": "Сўров бажарилмади. Саҳифани янгилаб, қайта уриниб кўринг.",
    ru: "Запрос не выполнен. Обновите страницу и повторите попытку.",
  });
}

export function networkErrorText(): string {
  return byLang({
    "uz-Latn": NETWORK_ERROR,
    "uz-Cyrl": "Сервер билан алоқа йўқ. Интернетни текшириб, қайта уриниб кўринг.",
    ru: "Нет связи с сервером. Проверьте интернет и повторите попытку.",
  });
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, problem: ProblemDetail | undefined) {
    super(problem?.detail || problem?.title || fallbackErrorText());
    this.name = "ApiError";
    this.status = status;
    this.code = problem?.code;
    this.fieldErrors = problem?.errors ?? {};
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  /** 4xx — qayta urinish foyda bermaydi. */
  get isClientError() {
    return this.status >= 400 && this.status < 500;
  }
}

function isProblemDetail(value: unknown): value is ProblemDetail {
  return typeof value === "object" && value !== null;
}

export function toApiError(status: number, body: unknown): ApiError {
  return new ApiError(status, isProblemDetail(body) ? body : undefined);
}
