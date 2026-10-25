"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { EMarketplaceRole } from "@/types";

/**
 * Onboarding finale. The check draws itself in via the transitions.dev #10
 * success-check pattern (`.t-success-check` in globals.css) — mounted with
 * data-state="in" since this step only ever appears once.
 */
export function DoneStep({ role, displayName }: { role: EMarketplaceRole; displayName: string }) {
  const freelancer = role === EMarketplaceRole.Freelancer;

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="t-success-check text-primary" data-state="in" aria-hidden>
        <svg viewBox="0 0 48 48" fill="none" className="size-20">
          <circle cx="24" cy="24" r="22" className="stroke-primary/20" strokeWidth="2" />
          <path
            d="M14 25 L21 32 L34 17"
            stroke="currentColor"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">
          You&apos;re all set{displayName ? `, ${displayName.split(" ")[0]}` : ""}
        </h1>
        <p className="max-w-sm text-sm text-muted-foreground">
          {freelancer
            ? "Your profile is ready. Browse open jobs and save the ones that fit."
            : "Your account is ready. Browse freelancers and find the right fit for your project."}
        </p>
      </div>

      <Button size="lg" className="min-w-56" asChild>
        <Link href={freelancer ? "/marketplace" : "/marketplace/talent"}>
          {freelancer ? "Find work" : "Browse talent"}
        </Link>
      </Button>
    </div>
  );
}
