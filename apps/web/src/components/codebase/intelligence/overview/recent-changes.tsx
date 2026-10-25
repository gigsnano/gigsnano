import { GitCommitIcon } from "@hugeicons/core-free-icons";

import type { IChangesSection } from "@/types/code/overview";

import { relativeTime } from "./overview-lib";
import { SectionCard } from "./section-card";

/** GIN-278 — recent commits from the indexed repo. The commit the index was built
 * from is marked "indexed"; the others are shown as history and are NOT implied to
 * be part of the current analysis. Timestamps are relative with the absolute ISO on
 * hover/`title` for accessibility. Empty history (shallow clone) is its own state. */
export function RecentChanges({ changes, index = 0 }: { changes: IChangesSection; index?: number }) {
  const items = changes.items.slice(0, 6);
  return (
    <SectionCard title="Recent changes" icon={GitCommitIcon} provenance={changes} index={index}>
      {items.length === 0 ? (
        <p className="py-3 text-sm text-muted-foreground">
          {changes.detail ?? "No commit history available for this repository."}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((c) => (
            <li key={c.sha} className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0 font-mono text-[10px] text-muted-foreground/80">
                {c.short_sha}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-xs">{c.message}</span>
                  {c.is_indexed_head ? (
                    <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      indexed
                    </span>
                  ) : null}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{c.author}</span>
                  {c.committed_at ? (
                    <>
                      <span aria-hidden>·</span>
                      <time dateTime={c.committed_at} title={c.committed_at}>
                        {relativeTime(c.committed_at)}
                      </time>
                    </>
                  ) : null}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
