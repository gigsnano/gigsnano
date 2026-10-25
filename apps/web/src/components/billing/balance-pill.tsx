"use client";

import Link from "next/link";

import { CostPill } from "@/components/billing/cost-pill";
import { useWalletBalance } from "@/hooks/billing/use-wallet";
import { cn } from "@/lib/utils";

/** Always-on wallet balance, calm by default, amber/red only when low/empty. */
export function BalancePill({ workspaceSlug }: { workspaceSlug: string }) {
  const { availableCents, isLow, isEmpty, isPending } = useWalletBalance(workspaceSlug);
  // Hold the pill's usual width while loading so the top bar (and the search
  // box centred in it) doesn't shift when the balance arrives.
  if (isPending) return <span aria-hidden className="h-8 w-[4.375rem] shrink-0" />;

  const tone = isEmpty ? "empty" : isLow ? "low" : "normal";
  return (
    <Link
      href={`/${workspaceSlug}/settings/billing`}
      aria-label={`AI balance ${(availableCents / 100).toFixed(2)} dollars${isLow ? ", low" : ""}`}
      title="AI wallet balance"
      className={cn(
        "flex h-8 items-center rounded-lg px-1.5 transition-colors duration-150",
        "hover:bg-sidebar-accent/60 active:scale-[0.97]",
      )}
    >
      <CostPill cents={availableCents} variant="balance" size="md" tone={tone} />
    </Link>
  );
}
