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

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly fieldErrors: Record<string, string>;

  constructor(status: number, problem: ProblemDetail | undefined) {
    super(problem?.detail || problem?.title || FALLBACK_ERROR);
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
