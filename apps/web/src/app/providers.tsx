"use client";

import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";

import { AccountSettingsModal } from "@/components/account/account-settings-modal";
import { getQueryClient } from "@/lib/query-client";

/** Global client-side providers. Mounted once in the root layout. */
export function Providers({ children }: { children: ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <QueryClientProvider client={queryClient}>
        {children}
        <AccountSettingsModal />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
