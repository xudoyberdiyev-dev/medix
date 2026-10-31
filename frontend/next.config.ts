import type { NextConfig } from "next";

/**
 * /api/* soʻrovlari Spring Boot backendga proksi qilinadi — sahifa va API bir domenda
 * (cookie va xavfsizlik oddiy, SPEC 10.1). BACKEND_URL berilmasa, proksi oʻchiq.
 */
const backendUrl = process.env.BACKEND_URL;

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
  async rewrites() {
    return backendUrl ? [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }] : [];
  },
};

export default nextConfig;
