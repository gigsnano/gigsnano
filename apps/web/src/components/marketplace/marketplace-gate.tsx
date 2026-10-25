"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { useMarketplaceProfileHydrated } from "@/hooks/marketplace/use-marketplace-profile-hydrated";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

/**
 * Onboarding gate: not-yet-onboarded visitors are sent to the wizard; already
 * onboarded users deep-linking to the wizard go to the marketplace home. The
 * "already" matters — completing the wizard flips `onboarded` mid-visit, and
 * the user must still see its final step, so we only bounce off /onboarding
 * based on the value captured when the route was entered. Children render only
 * after the persisted store has hydrated so redirects never flash stale UI.
 */
export function MarketplaceGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const hydrated = useMarketplaceProfileHydrated();
  const onboarded = useMarketplaceProfileStore((s) => s.onboarded);
  const [onboardedAtEntry, setOnboardedAtEntry] = useState<boolean | null>(null);

  const onOnboarding = pathname.startsWith("/marketplace/onboarding");

  if (!onOnboarding && onboardedAtEntry !== null) {
    setOnboardedAtEntry(null);
  } else if (hydrated && onOnboarding && onboardedAtEntry === null) {
    setOnboardedAtEntry(onboarded);
  }

  const awaitingCapture = onOnboarding && onboardedAtEntry === null;
  const shouldRedirect =
    hydrated && !awaitingCapture && (onOnboarding ? onboardedAtEntry === true : !onboarded);

  useEffect(() => {
    if (!shouldRedirect) return;
    router.replace(onOnboarding ? "/marketplace" : "/marketplace/onboarding");
  }, [shouldRedirect, onOnboarding, router]);

  if (!hydrated || awaitingCapture || shouldRedirect) return null;
  return <>{children}</>;
}
