import type { NextConfig } from "next";

/**
 * /api/* soʻrovlari Spring Boot backendga proksi qilinadi — sahifa va API bir domenda
 * (cookie va xavfsizlik oddiy, SPEC 10.1). BACKEND_URL berilmasa, proksi oʻchiq.
 */
const backendUrl = process.env.BACKEND_URL;
const dev = process.env.NODE_ENV !== "production";

/**
 * P3: xavfsizlik sarlavhalari. API shu domenda (proksi) — connect-src 'self'; tashqi manba yoʻq.
 * Next.js gidratatsiya skriptlari inline — 'unsafe-inline' (nonce dinamik renderni talab qiladi).
 * Hujjatlar (PDF/Excel) blob: orqali ochiladi va yuklanadi.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${dev ? " ws:" : ""}`,
  "media-src 'self' data: blob:",
  "object-src 'self' blob:",
  "frame-src 'self' blob:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
];

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  async rewrites() {
    return backendUrl ? [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
