import Link from "next/link";

import type { IFreelancer } from "@/types";

import { AvatarCircle } from "../shared/avatar-circle";
import { SkillTags } from "../shared/skill-tags";
import { TalentBadge } from "../shared/talent-badge";

/** One freelancer row in talent search results (talent-tile anatomy). */
export function FreelancerCard({ freelancer }: { freelancer: IFreelancer }) {
  return (
    <article className="group relative -mx-3 rounded-lg px-3 py-5 transition-colors duration-150 hover:bg-muted/40">
      <div className="flex items-start gap-4">
        <AvatarCircle name={freelancer.name} availableNow={freelancer.available_now} />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-base font-semibold">
                <Link
                  href={`/marketplace/talent/${freelancer.id}`}
                  className="transition-colors duration-150 after:absolute after:inset-0 group-hover:text-primary"
                >
                  {freelancer.name}
                </Link>
              </h3>
              <p className="truncate text-sm text-foreground/90">{freelancer.title}</p>
              <p className="text-xs text-muted-foreground">{freelancer.country}</p>
            </div>
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              ${freelancer.hourly_rate}/hr
            </p>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
            {freelancer.badge && <TalentBadge badge={freelancer.badge} />}
            <span className="font-medium text-foreground">
              {freelancer.job_success_pct}% Job Success
            </span>
            <span>{freelancer.total_earned_label} earned</span>
            {freelancer.available_now && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                Available now
              </span>
            )}
          </div>

          <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">{freelancer.overview}</p>

          <div className="mt-2.5">
            <SkillTags skills={freelancer.skills} max={6} />
          </div>
        </div>
      </div>
    </article>
  );
}
