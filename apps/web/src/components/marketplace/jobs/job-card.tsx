import Link from "next/link";

import type { IMarketplaceJob } from "@/types";

import { ClientMetaLine } from "../shared/client-meta-line";
import { JobMetaLine } from "../shared/job-meta-line";
import { SaveToggle } from "../shared/save-toggle";
import { SkillTags } from "../shared/skill-tags";
import { timeAgo } from "../shared/time-ago";

/** One job row in the feed / search results (job-tile anatomy). */
export function JobCard({ job }: { job: IMarketplaceJob }) {
  return (
    <article className="group relative -mx-3 rounded-lg px-3 py-5 transition-colors duration-150 hover:bg-muted/40">
      <div className="flex items-start justify-between gap-4">
        <p className="text-xs text-muted-foreground">
          Posted {timeAgo(job.posted_at)}
          <span className="mx-1.5" aria-hidden>
            ·
          </span>
          Proposals: {job.proposals_label}
        </p>
        <SaveToggle jobId={job.id} className="relative z-[1] -mt-1.5" />
      </div>

      <h3 className="mt-1 text-lg font-semibold leading-snug">
        <Link
          href={`/marketplace/jobs/${job.id}`}
          className="transition-colors duration-150 after:absolute after:inset-0 group-hover:text-primary"
        >
          {job.title}
        </Link>
      </h3>

      <div className="mt-1.5 flex flex-col gap-2">
        <JobMetaLine job={job} />
        <ClientMetaLine client={job.client} />
        <p className="line-clamp-2 text-sm text-muted-foreground">{job.description}</p>
        <SkillTags skills={job.skills} max={6} />
      </div>
    </article>
  );
}
