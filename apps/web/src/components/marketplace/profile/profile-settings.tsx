"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { HOURS_PER_WEEK_OPTIONS } from "@/constants/marketplace";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

/** Own-profile settings sub-screen: visibility, availability, and a danger-zone reset. */
export function ProfileSettings() {
  const isPublic = useMarketplaceProfileStore((s) => s.profile_public);
  const hours = useMarketplaceProfileStore((s) => s.hours_per_week);
  const updateProfile = useMarketplaceProfileStore((s) => s.updateProfile);
  const reset = useMarketplaceProfileStore((s) => s.reset);
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);

  const doReset = () => {
    reset();
    router.push("/marketplace/onboarding");
  };

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href="/marketplace/profile"
        className="group/back mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <HugeiconsIcon
          icon={ArrowLeft01Icon}
          className="size-4 transition-transform duration-150 ease-out group-hover/back:-translate-x-0.5"
        />
        Back to profile
      </Link>
      <h1 className="text-2xl font-semibold tracking-tight">Profile settings</h1>

      {/* Visibility */}
      <section
        className="mt-6 rounded-xl border bg-card p-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out"
        style={{ animationDelay: "0ms" }}
      >
        <h2 className="text-base font-semibold">Profile visibility</h2>
        <p className="mt-1 text-sm text-muted-foreground">Control whether clients can find your public profile.</p>
        <div className="mt-3 inline-flex rounded-lg border p-0.5">
          {[
            { v: true, label: "Public" },
            { v: false, label: "Private" },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => updateProfile({ profile_public: o.v })}
              className={cn(
                "rounded-md px-4 py-1.5 text-sm font-medium transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.97]",
                isPublic === o.v
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {o.label}
            </button>
          ))}
        </div>
      </section>

      {/* Availability */}
      <section
        className="mt-4 rounded-xl border bg-card p-5 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out"
        style={{ animationDelay: "40ms" }}
      >
        <h2 className="text-base font-semibold">Availability</h2>
        <select
          value={hours}
          onChange={(e) => updateProfile({ hours_per_week: e.target.value })}
          className="mt-3 h-9 w-full max-w-xs cursor-pointer rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <option value="">Set your availability</option>
          {HOURS_PER_WEEK_OPTIONS.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
      </section>

      {/* Danger */}
      <section
        className="mt-4 rounded-xl border border-destructive/30 bg-card p-5 transition-colors hover:border-destructive/50 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-backwards motion-safe:duration-300 motion-safe:ease-out"
        style={{ animationDelay: "80ms" }}
      >
        <h2 className="text-base font-semibold text-destructive">Reset profile</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Clears your marketplace profile and returns you to onboarding.
        </p>
        <Button
          variant="outline"
          className="mt-3 border-destructive/40 text-destructive hover:bg-destructive/5"
          onClick={() => setConfirmOpen(true)}
        >
          Reset profile
        </Button>
      </section>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogTitle className="text-lg font-semibold">Reset your profile?</DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            This clears all your marketplace profile data. This can&apos;t be undone.
          </DialogDescription>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button className="bg-destructive text-white hover:bg-destructive/90" onClick={doReset}>
              Reset
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
