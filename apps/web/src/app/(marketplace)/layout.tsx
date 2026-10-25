import type { ReactNode } from "react";

import { AuthGuard } from "@/components/auth/auth-guard";
import { MarketplaceGate, MarketplaceHeader } from "@/components/marketplace";

export default function MarketplaceLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <MarketplaceHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {/* Require a real session first (redirects to /sign-in?next=… on 401),
            then the onboarding gate. Without this, a signed-out visitor reached
            the feed and got a raw 401 error instead of a sign-in prompt. */}
        <AuthGuard>
          <MarketplaceGate>{children}</MarketplaceGate>
        </AuthGuard>
      </main>
    </div>
  );
}
