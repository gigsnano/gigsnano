"use client";

import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Idea01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";

/**
 * Freelance-marketplace feed chrome: a dark promo card + a tinted "to do" strip, both
 * dismissible for the session. CTAs open the complete-profile modal.
 */
export function PromoBanner({ onAction }: { onAction: () => void }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <section className="relative mt-4 overflow-hidden rounded-xl bg-foreground p-6 text-background">
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => setDismissed(true)}
        className="absolute right-4 top-4 rounded-full p-1 text-background/70 transition-colors hover:text-background"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
      </button>
      <div className="max-w-md">
        <p className="text-sm font-medium text-background/70">Win work with a targeted profile</p>
        <h2 className="mt-1.5 text-2xl font-semibold leading-snug tracking-tight">
          A complete profile increases your chance of getting hired by up to 2x.
        </h2>
        <Button
          onClick={onAction}
          className="mt-4 bg-background text-foreground shadow-none hover:bg-background/85"
        >
          Complete your profile
        </Button>
      </div>
    </section>
  );
}

export function TipStrip({ children }: { children: ReactNode }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  return (
    <div className="mt-4 flex items-center gap-2.5 rounded-lg bg-primary/8 px-4 py-2.5 text-sm">
      <HugeiconsIcon icon={Idea01Icon} className="size-4 shrink-0 text-primary" />
      <p className="min-w-0 flex-1">{children}</p>
      <button
        type="button"
        aria-label="Dismiss tip"
        onClick={() => setDismissed(true)}
        className="rounded-full p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </div>
  );
}
