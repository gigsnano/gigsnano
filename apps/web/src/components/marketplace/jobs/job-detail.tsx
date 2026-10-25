"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowLeft01Icon,
  Award01Icon,
  Calendar03Icon,
  Clock01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketplaceJob } from "@/hooks/marketplace/use-marketplace";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

import { ClientCard } from "./client-card";
import { EXPERIENCE_LABELS, formatJobRate } from "../shared/job-meta";
import { SaveToggle } from "../shared/save-toggle";
import { SkillTags } from "../shared/skill-tags";
import { timeAgo } from "../shared/time-ago";

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <Skeleton className="h-4 w-32" />
      <Skeleton className="h-8 w-2/3" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
      <div className="flex gap-8">
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-12 w-40" />
      </div>
    </div>
  );
}

/** Full job listing (job-detail anatomy): main column + client rail. */
export function JobDetail({ jobId }: { jobId: string }) {
  const { data: job, isPending, isError } = useMarketplaceJob(jobId);
  const saved = useMarketplaceProfileStore((s) => s.saved_job_ids.includes(jobId));

  if (isPending) return <DetailSkeleton />;
  if (isError || !job) {
    return (
      <EmptyState
        assetKey="error-404"
        title="Job not found"
        description="This listing may have been closed or removed."
        actions={[{ label: "Back to job search", href: "/marketplace/jobs" }]}
      />
    );
  }

  const meta = [
    {
      icon: Clock01Icon,
      label: job.hours_per_week_label,
      sub: "Hourly workload",
    },
    {
      icon: Calendar03Icon,
      label: job.duration_label,
      sub: "Project length",
    },
    {
      icon: Award01Icon,
      label: EXPERIENCE_LABELS[job.experience_level],
      sub: "Experience level",
    },
  ];

  return (
    <div>
      <Link
        href="/marketplace/jobs"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        Back to search
      </Link>

      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-snug tracking-tight">{job.title}</h1>
          <p className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span>Posted {timeAgo(job.posted_at)}</span>
            <span className="inline-flex items-center gap-0.5">
              <HugeiconsIcon icon={Location01Icon} className="size-3.5" />
              Worldwide
            </span>
          </p>

          <div className="mt-6 whitespace-pre-line border-t pt-6 text-sm leading-relaxed text-foreground/90">
            {job.description}
          </div>

          <div className="mt-6 grid gap-6 border-t pt-6 sm:grid-cols-3">
            {meta.map((m) => (
              <div key={m.sub} className="flex items-start gap-2.5">
                <HugeiconsIcon icon={m.icon} className="mt-0.5 size-4.5 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">{m.label}</p>
                  <p className="text-xs text-muted-foreground">{m.sub}</p>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-6 border-t pt-6 text-sm">
            <span className="font-medium">{formatJobRate(job)}</span>
            <span className="mx-1.5 text-muted-foreground" aria-hidden>
              ·
            </span>
            <span className="text-muted-foreground">{job.category}</span>
          </p>

          <section className="mt-6 border-t pt-6">
            <h2 className="text-base font-semibold">Skills and expertise</h2>
            <div className="mt-3">
              <SkillTags skills={job.skills} />
            </div>
          </section>

          <section className="mt-6 border-t pt-6">
            <h2 className="text-base font-semibold">Activity on this job</h2>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm text-muted-foreground">
              <div className="flex gap-1.5">
                <dt>Proposals:</dt>
                <dd className="font-medium text-foreground">{job.proposals_label}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Interviewing:</dt>
                <dd className="font-medium text-foreground">{job.interviewing}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Invites sent:</dt>
                <dd className="font-medium text-foreground">{job.invites_sent}</dd>
              </div>
            </dl>
          </section>
        </div>

        <aside className="flex flex-col gap-4 self-start lg:sticky lg:top-20">
          <Button size="lg" className="w-full">
            Apply now
          </Button>
          <div className="flex items-center justify-center gap-2">
            <SaveToggle jobId={job.id} />
            <span className="text-sm text-muted-foreground">{saved ? "Saved" : "Save job"}</span>
          </div>
          <ClientCard client={job.client} />
        </aside>
      </div>
    </div>
  );
}
