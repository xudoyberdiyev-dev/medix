import { NextResponse, type NextRequest } from "next/server";

/** Spring Session cookie nomi (backend: SecurityConfig.SESSION_COOKIE). */
export const SESSION_COOKIE = "MEDIX_SESSION";

const PUBLIC_PATHS = ["/login", "/ui-kit"];

/**
 * Optimistik tekshiruv: sessiya cookie'si boʻlmasa — login sahifasiga.
 * Haqiqiy tekshiruv backendda (har API 401); muddati oʻtgan cookie'ni AuthGate ushlaydi.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  if (request.cookies.has(SESSION_COOKIE)) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  // API (backendga proksi), Next ichki fayllari va statik fayllar tekshirilmaydi.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.[a-zA-Z0-9]+$).*)"],
};
