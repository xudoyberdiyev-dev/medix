"use client";

import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { makeQueryClient } from "@/lib/api/query-client";

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Serverda har render uchun yangi mijoz; brauzerda bitta (kesh saqlanadi).
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
