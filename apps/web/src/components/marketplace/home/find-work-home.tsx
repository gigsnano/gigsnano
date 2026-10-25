"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { FilterHorizontalIcon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { ListingCard } from "@/components/marketplace/listings/listing-card";
import { useSlidingTabs } from "@/hooks/ui/use-sliding-tabs";
import { sortJobs } from "@/lib/marketplace/marketplace-filtering";
import { useMarketplaceJobs } from "@/hooks/marketplace/use-marketplace";
import { usePublicListings } from "@/hooks/marketplace/use-marketplace-flow";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";
import { cn } from "@/lib/utils";

import { JobCard } from "../jobs/job-card";
import { ListSkeleton } from "../shared/list-skeleton";
import { SearchInput } from "../shared/search-input";
import { CompleteProfileDialog } from "./complete-profile-dialog";
import { PromoBanner, TipStrip } from "./feed-banners";
import { ProfileRailCard } from "./profile-rail-card";
import { ConnectsCard, PromoteCard, RailDisclosures, VerificationCard } from "./rail-cards";

const TABS = [
  { key: "best", label: "Best matches" },
  { key: "recent", label: "Most recent" },
  { key: "saved", label: "Saved" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Marketplace home: banners → search → feed tabs → job feed, plus the rail card stack. */
export function FindWorkHome() {
  const router = useRouter();
  const { data: jobs, isPending, isError, refetch } = useMarketplaceJobs();
  const { data: listings } = usePublicListings();
  const savedIds = useMarketplaceProfileStore((s) => s.saved_job_ids);
  const [tab, setTab] = useState<TabKey>("best");
  const activeIndex = TABS.findIndex((t) => t.key === tab);
  const { barRef, pillRef } = useSlidingTabs(activeIndex);
  const [search, setSearch] = useState("");
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);

  const feed =
    !jobs ? []
    : tab === "recent" ? sortJobs(jobs, "newest")
    : tab === "saved" ? jobs.filter((j) => savedIds.includes(j.id))
    : jobs;

  return (
    <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight">Find work</h1>

        <PromoBanner onAction={() => setProfileDialogOpen(true)} />
        <TipStrip>
          To do:{" "}
          <button
            type="button"
            onClick={() => setProfileDialogOpen(true)}
            className="font-medium underline underline-offset-4 transition-colors hover:text-primary"
          >
            Complete your profile.
          </button>{" "}
          Clients trust and hire people who tell their story well.
        </TipStrip>

        <SearchInput
          value={search}
          onChange={setSearch}
          onSubmit={(v) =>
            router.push(`/marketplace/jobs${v.trim() ? `?q=${encodeURIComponent(v.trim())}` : ""}`)
          }
          placeholder="Search for jobs"
          className="mt-4"
        />

        <div className="mt-6 flex items-center justify-between gap-4 border-b">
          <div ref={barRef} className="relative flex gap-1" role="tablist">
            <span
              ref={pillRef}
              className="pointer-events-none absolute bottom-0 left-0 h-0.5 rounded-full bg-primary"
              style={{ transition: "transform var(--tabs-dur) var(--tabs-ease), width var(--tabs-dur) var(--tabs-ease)" }}
              aria-hidden
            />
            {TABS.map((t, i) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={t.key === tab}
                data-tab-index={i}
                onClick={() => setTab(t.key)}
                className={cn(
                  "relative z-[1] px-3 py-2.5 text-sm font-medium transition-colors duration-150",
                  t.key === tab ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Link
            href="/marketplace/jobs"
            className="mb-1.5 inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
          >
            <HugeiconsIcon icon={FilterHorizontalIcon} className="size-3.5" />
            Filters
          </Link>
        </div>

        {isPending ? (
          <ListSkeleton rows={4} />
        ) : isError ? (
          <EmptyState
            assetKey="error"
            title="Couldn't load your feed"
            description="Something went wrong while loading jobs."
            actions={[{ label: "Try again", onClick: () => refetch() }]}
          />
        ) : feed.length === 0 && !(listings?.length && tab !== "saved") ? (
          tab === "saved" ? (
            <EmptyState
              assetKey="board"
              title="No saved jobs yet"
              description="Tap the heart on any job to keep it here for later."
              actions={[{ label: "Find work", onClick: () => setTab("best") }]}
            />
          ) : (
            <EmptyState
              assetKey="search-empty"
              title="No jobs right now"
              description="Check back soon — new work is posted all the time."
              actions={[{ label: "Refresh", onClick: () => refetch() }]}
            />
          )
        ) : (
          <div className="flex flex-col divide-y">
            {tab !== "saved" && listings?.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
            {feed.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        )}
      </div>

      <aside className="hidden flex-col gap-4 self-start lg:flex">
        <ProfileRailCard onCompleteProfile={() => setProfileDialogOpen(true)} />
        <VerificationCard />
        <PromoteCard />
        <ConnectsCard />
        <RailDisclosures />
      </aside>

      <CompleteProfileDialog open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />
    </div>
  );
}
