"use client";

import Link from "next/link";

import { useIsClient } from "@/hooks/ui/use-is-client";

import { profileCompleteness } from "@/lib/marketplace/marketplace-profile-completeness";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";
import { EMarketplaceRole } from "@/types";

import { AvatarCircle } from "../shared/avatar-circle";

/**
 * Right-rail identity card (marketplace profile card): avatar + name linking to
 * the profile editor, then a "Complete your profile" link with the progress
 * bar and right-aligned percentage.
 */
export function ProfileRailCard({ onCompleteProfile }: { onCompleteProfile: () => void }) {
  const profile = useMarketplaceProfileStore();
  const mounted = useIsClient();

  if (!mounted) return <div className="h-40 rounded-xl border bg-card" aria-hidden />;

  const freelancer = profile.role === EMarketplaceRole.Freelancer;
  const pct = profileCompleteness(profile);

  return (
    <section className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-3">
        <AvatarCircle name={profile.display_name || "?"} availableNow={freelancer} />
        <div className="min-w-0">
          <Link
            href="/marketplace/profile"
            className="block truncate text-sm font-semibold underline-offset-4 transition-colors hover:text-primary hover:underline"
          >
            {profile.display_name || "Your profile"}
          </Link>
          <p className="truncate text-xs text-muted-foreground">
            {freelancer ? profile.title || "Freelancer" : profile.company_name || "Client"}
          </p>
        </div>
      </div>

      {freelancer && profile.hourly_rate != null && (
        <p className="mt-3 text-sm text-muted-foreground">
          Rate: <span className="font-medium text-foreground">${profile.hourly_rate}/hr</span>
        </p>
      )}

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onCompleteProfile}
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Complete your profile
          </button>
          <span className="text-xs font-medium tabular-nums text-muted-foreground">{pct}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      <p className="mt-4 border-t pt-3 text-xs text-muted-foreground">
        Saved jobs:{" "}
        <span className="font-medium tabular-nums text-foreground">
          {profile.saved_job_ids.length}
        </span>
      </p>
    </section>
  );
}
