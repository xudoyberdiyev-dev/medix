import createClient, { type Middleware } from "openapi-fetch";
import { CSRF_COOKIE, CSRF_HEADER, needsCsrf, readCookie } from "./csrf";
import { ApiError, toApiError } from "./errors";
import type { paths } from "./schema";

/**
 * Tiplangan API mijozi. Tiplar faqat OpenAPI'dan (`pnpm api:gen`), qo'lda yozilmaydi.
 * Sahifa va API bir domenda (`/api/*` → backend proksi), shuning uchun baseUrl nisbiy
 * va sessiya httpOnly cookie orqali yuradi.
 */
const csrfMiddleware: Middleware = {
  onRequest({ request }) {
    if (typeof document !== "undefined" && needsCsrf(request.method)) {
      const token = readCookie(document.cookie, CSRF_COOKIE);
      if (token) request.headers.set(CSRF_HEADER, token);
    }
    return request;
  },
};

export const api = createClient<paths>({
  baseUrl: "",
  credentials: "same-origin",
  headers: { Accept: "application/json" },
});

api.use(csrfMiddleware);

type FetchResult<T> = { data?: T; error?: unknown; response: Response };

/**
 * openapi-fetch natijasini TanStack Query uchun ochadi: muvaffaqiyatda `data`,
 * aks holda `ApiError` tashlaydi.
 *
 * @example useQuery({ queryKey: ["me"], queryFn: () => unwrap(api.GET("/api/auth/me")) })
 */
export async function unwrap<T>(promise: Promise<FetchResult<T>>): Promise<T> {
  const { data, error, response } = await promise;
  if (!response.ok || error !== undefined) {
    throw toApiError(response.status, error);
  }
  return data as T;
}

export { ApiError };
