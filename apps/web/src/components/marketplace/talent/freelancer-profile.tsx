"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon, CheckmarkBadge01Icon, Location01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useFreelancer } from "@/hooks/marketplace/use-marketplace";

import { AvatarCircle } from "../shared/avatar-circle";
import { SkillTags } from "../shared/skill-tags";
import { TalentBadge } from "../shared/talent-badge";
import { WorkHistoryList } from "./work-history-list";

function ProfileSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="flex items-center gap-4">
        <Skeleton className="size-20 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      <div className="flex gap-8">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-32" />
      </div>
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

const STATS = [
  { key: "earned", label: "Total earned" },
  { key: "jobs", label: "Completed jobs" },
  { key: "hours", label: "Hours worked" },
] as const;

/** Full freelancer profile (profile anatomy, minimal sections). */
export function FreelancerProfile({ freelancerId }: { freelancerId: string }) {
  const { data: f, isPending, isError } = useFreelancer(freelancerId);

  if (isPending) return <ProfileSkeleton />;
  if (isError || !f) {
    return (
      <EmptyState
        assetKey="error-404"
        title="Freelancer not found"
        description="This profile may have been removed."
        actions={[{ label: "Back to talent search", href: "/marketplace/talent" }]}
      />
    );
  }

  const statValues: Record<(typeof STATS)[number]["key"], string> = {
    earned: f.total_earned_label,
    jobs: f.jobs_count.toLocaleString(),
    hours: f.hours_worked.toLocaleString(),
  };

  return (
    <div>
      <Link
        href="/marketplace/talent"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
        Back to search
      </Link>

      {/* Header band */}
      <div className="mt-4 rounded-xl border bg-card p-6">
        <div className="flex flex-wrap items-center gap-5">
          <AvatarCircle name={f.name} availableNow={f.available_now} size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{f.name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
              <HugeiconsIcon icon={Location01Icon} className="size-4" />
              {f.city}, {f.country}
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {f.badge && <TalentBadge badge={f.badge} />}
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {f.job_success_pct}% Job Success
              </span>
              {f.available_now && (
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                  Available now
                </span>
              )}
            </div>
          </div>
        </div>

        <dl className="mt-6 grid grid-cols-3 gap-4 border-t pt-5">
          {STATS.map((stat) => (
            <div key={stat.key}>
              <dd className="text-xl font-semibold tabular-nums">{statValues[stat.key]}</dd>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {/* Body */}
      <div className="mt-8 grid gap-10 lg:grid-cols-[260px_1fr]">
        <aside className="flex flex-col gap-6 self-start text-sm lg:sticky lg:top-20">
          <div>
            <h2 className="font-semibold">Hours per week</h2>
            <p className="mt-1 text-muted-foreground">{f.hours_per_week_label}</p>
          </div>
          <div>
            <h2 className="font-semibold">Languages</h2>
            <ul className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
              {f.languages.map((lang) => (
                <li key={lang}>{lang}</li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-semibold">Verifications</h2>
            <ul className="mt-1 flex flex-col gap-1">
              {f.verifications.map((v) => (
                <li key={v} className="flex items-center gap-1.5 text-muted-foreground">
                  <HugeiconsIcon icon={CheckmarkBadge01Icon} className="size-4 text-primary" />
                  {v}
                </li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">Member since {f.member_since}</p>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h2 className="max-w-xl text-lg font-semibold leading-snug">{f.title}</h2>
            <p className="text-lg font-semibold tabular-nums">${f.hourly_rate.toFixed(2)}/hr</p>
          </div>
          <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {f.overview}
          </div>

          <section className="mt-8 border-t pt-6">
            <h2 className="text-base font-semibold">
              Work history{" "}
              <span className="font-normal text-muted-foreground">({f.work_history.length})</span>
            </h2>
            <div className="mt-4">
              <WorkHistoryList items={f.work_history} />
            </div>
          </section>

          <section className="mt-8 border-t pt-6">
            <h2 className="text-base font-semibold">Skills</h2>
            <div className="mt-3">
              <SkillTags skills={f.skills} />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
