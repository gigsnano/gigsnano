"use client";

import { relativeTime } from "@/lib/format/relative-time";
import type { IIndexQuality } from "@/lib/code/real-intelligence";
import type { ILanguageLoc } from "@/types/code/metrics";
import type { ICodebaseMetric, ICodebaseRepoContext } from "@/types/code/intelligence";

/** "Index health" used to be the literal string "Healthy", regardless of the index.
 * `indexQuality` already measures this from the real graph — use what it says. */
const QUALITY_LABEL: Record<IIndexQuality["level"], string> = {
  healthy: "Healthy",
  degraded: "Structural only",
  partial: "Partial — 0 symbols",
  none: "Not indexed",
};

/** Inspector content before any node is selected: repository-level summary. */
export function RepositoryOverview({
  repo,
  metrics,
  languages,
  quality,
}: {
  repo: ICodebaseRepoContext;
  metrics: ICodebaseMetric[] | null;
  languages: ILanguageLoc[] | null;
  quality: IIndexQuality;
}) {
  // Only rows we actually know. Branch/commit/indexed-at are null on a project that
  // has no repo linked or has never finished an index (GIN-158).
  const rows: [string, string][] = [
    ["Repository", repo.repo],
    ...(repo.branch ? ([["Branch", repo.branch]] as [string, string][]) : []),
    ...(repo.commitSha ? ([["Commit", repo.commitSha.slice(0, 7)]] as [string, string][]) : []),
    ["Last indexed", repo.lastIndexedIso ? relativeTime(repo.lastIndexedIso) : "Never"],
    ["Index health", QUALITY_LABEL[quality.level]],
  ];

  return (
    <div className="flex flex-col gap-5 p-4">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Repository overview</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Select a node in the graph or explorer to inspect it.
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="flex flex-col">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="truncate font-medium text-foreground">{v}</dd>
          </div>
        ))}
      </dl>

      <div>
        <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Counts
        </h3>
        <div className="grid grid-cols-2 gap-1.5">
          {(metrics ?? []).map((m) => (
            <div
              key={m.key}
              className="flex items-center justify-between rounded-md border px-2.5 py-1.5 text-sm"
            >
              <span className="text-muted-foreground">{m.label}</span>
              <span className="font-semibold tabular-nums text-foreground">{m.value}</span>
            </div>
          ))}
        </div>
      </div>

      {languages && languages.length > 0 ? (
        <div>
          <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Languages
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {languages.slice(0, 8).map((l) => (
              <span
                key={l.name}
                className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs text-foreground"
              >
                {l.name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
