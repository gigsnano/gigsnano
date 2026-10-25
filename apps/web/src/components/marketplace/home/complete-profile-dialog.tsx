"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgressRing } from "@/components/ui/progress-ring";
import {
  profileChecklist,
  profileCompleteness,
} from "@/lib/marketplace/marketplace-profile-completeness";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

/**
 * Freelance-marketplace "Complete your profile" modal: left panel with the avatar inside
 * a progress ring, right panel with the weighted checklist. Rows link to the
 * profile editor.
 */
export function CompleteProfileDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const profile = useMarketplaceProfileStore();
  const pct = profileCompleteness(profile);
  const rows = profileChecklist(profile);
  const initials = profile.display_name
    ? profile.display_name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : "?";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0">
        <div className="grid sm:grid-cols-[240px_1fr]">
          <div className="hidden flex-col items-center justify-center gap-3 rounded-l-lg bg-muted/50 p-6 text-center sm:flex">
            <span className="relative inline-flex items-center justify-center">
              <ProgressRing value={pct} size={128} strokeWidth={5} />
              <span className="absolute flex size-24 items-center justify-center rounded-full bg-primary/10 text-2xl font-semibold text-primary">
                {initials}
              </span>
            </span>
            <p className="text-sm font-medium tabular-nums">{pct}% complete</p>
            <p className="text-base font-semibold">
              {pct >= 100 ? "Looking sharp!" : "You're on your way!"}
            </p>
          </div>

          <div className="flex flex-col p-6">
            <DialogTitle className="text-lg font-semibold">Complete your profile</DialogTitle>
            <DialogDescription className="mt-1 text-sm text-muted-foreground">
              {profile.role === "client"
                ? "Clients with complete profiles attract stronger proposals."
                : "Freelancers with complete, quality profiles are far more likely to get hired."}
            </DialogDescription>

            <ul className="mt-4 flex flex-col divide-y">
              {rows.map((row) => (
                <li key={row.key}>
                  <Link
                    href="/marketplace/profile"
                    onClick={() => onOpenChange(false)}
                    className="group flex items-center gap-3 py-3 transition-colors hover:text-primary"
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                        row.done
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted-foreground/40",
                      )}
                      aria-hidden
                    >
                      {row.done && (
                        <svg viewBox="0 0 12 12" fill="none" className="size-3">
                          <path
                            d="M2.5 6.5l2.5 2.5 4.5-5.5"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{row.label}</span>
                      <span className="block text-xs text-muted-foreground">{row.hint}</span>
                    </span>
                    {!row.done && (
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        +{row.weight}%
                      </span>
                    )}
                    <HugeiconsIcon
                      icon={ArrowRight01Icon}
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                    />
                  </Link>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex justify-end">
              <DialogClose asChild>
                <Button>Close</Button>
              </DialogClose>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
