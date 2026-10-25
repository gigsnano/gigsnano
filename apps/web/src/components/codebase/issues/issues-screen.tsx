"use client";

import { EmptyState } from "@/components/empty-state";
import { useCodeIssues } from "@/hooks/code/use-code-issues";
import { useIndexStatus } from "@/hooks/code/use-index-status";
import { cn } from "@/lib/utils";
import { EIndexStatus, type IIssue, type TIssueSeverity } from "@/types";

import { PromoteToWorkItem } from "./promote-to-work-item";

/** Severity styling via theme tokens only — `destructive` for ERROR, a muted
 * treatment for the rest. No hardcoded reds/ambers, so both themes work. */
const SEVERITY_CLASS: Record<TIssueSeverity, string> = {
  ERROR: "border-destructive/30 bg-destructive/10 text-destructive",
  WARNING: "border-border bg-muted text-foreground",
  INFO: "border-border bg-muted/50 text-muted-foreground",
};

const SEVERITY_ORDER: Record<TIssueSeverity, number> = { ERROR: 0, WARNING: 1, INFO: 2 };

/** Group findings by file, most-severe file first, so the worst thing is on screen
 * without needing a filter rail. */
function groupByFile(issues: IIssue[]): [string, IIssue[]][] {
  const byFile = new Map<string, IIssue[]>();
  for (const issue of issues) {
    const rows = byFile.get(issue.file);
    if (rows) rows.push(issue);
    else byFile.set(issue.file, [issue]);
  }
  for (const rows of byFile.values()) {
    rows.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.line - b.line);
  }
  return [...byFile.entries()].sort(
    ([, a], [, b]) => SEVERITY_ORDER[a[0].severity] - SEVERITY_ORDER[b[0].severity],
  );
}

function SeverityPill({ severity }: { severity: TIssueSeverity }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
        SEVERITY_CLASS[severity],
      )}
    >
      {severity.toLowerCase()}
    </span>
  );
}

function IssueRow({
  issue,
  workspaceSlug,
  projectId,
}: {
  issue: IIssue;
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <li className="flex items-start justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <SeverityPill severity={issue.severity} />
          <span className="font-mono text-xs text-muted-foreground">L{issue.line}</span>
        </div>
        <p className="text-sm text-foreground">{issue.message}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {issue.rule}
          </span>
          {issue.cwe.map((c) => (
            <span
              key={c}
              className="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {/* CWE metadata arrives as "CWE-327: Use of a Broken ..." — the id alone is enough here. */}
              {c.split(":")[0]}
            </span>
          ))}
        </div>
      </div>
      <PromoteToWorkItem workspaceSlug={workspaceSlug} projectId={projectId} issue={issue} />
    </li>
  );
}

/**
 * Static-analysis findings for the indexed repo.
 *
 * Four states that must never collapse into each other: not indexed, *not scanned*
 * (`scanned: false` — the scanner was unavailable), scanned-and-clean, and
 * populated. "We didn't look" and "we looked and it's clean" are different facts.
 */
export function IssuesScreen({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { status } = useIndexStatus(workspaceSlug, projectId);
  const isReady = status === EIndexStatus.Ready;
  const { data, isLoading, isError, refetch } = useCodeIssues(workspaceSlug, projectId, isReady);

  if (!isReady) {
    return (
      <EmptyState
        assetKey="generic"
        title="Index the repo to see issues"
        description="Static-analysis findings (bugs, risky patterns, vulnerabilities) come from the codebase index."
      />
    );
  }

  if (isLoading) {
    return (
      <div className="flex size-full items-center justify-center text-sm text-muted-foreground">
        Loading issues…
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load issues"
        description="Something went wrong fetching the findings. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (!data?.scanned) {
    return (
      <EmptyState
        assetKey="generic"
        title="Issue scan unavailable for this index"
        description="The scanner didn't run for this index, so there are no findings to show. This is not the same as a clean repo — re-index to try again."
      />
    );
  }

  if (data.issues.length === 0) {
    return (
      <EmptyState
        assetKey="generic"
        title="No issues found"
        description="The scan completed and turned up nothing. Findings will appear here after future indexes if anything changes."
      />
    );
  }

  const groups = groupByFile(data.issues);

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-1">
      <div className="flex items-center justify-between px-1">
        <p className="text-sm text-muted-foreground">
          {data.issues.length} {data.issues.length === 1 ? "finding" : "findings"} in {groups.length}{" "}
          {groups.length === 1 ? "file" : "files"}
        </p>
      </div>

      {/* Never hide a cap: a truncated list that looks complete is the same class of
          lie as reporting an unmeasured value as zero. */}
      {data.truncated ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Showing the first {data.issues.length} findings — the scan produced more than the backend
          returns. Fix the highest-severity ones and re-index to see the rest.
        </p>
      ) : null}

      {groups.map(([file, rows]) => (
        <div key={file} className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b bg-muted/40 px-4 py-2">
            <p className="truncate font-mono text-xs text-muted-foreground" title={file}>
              {file}
            </p>
          </div>
          <ul className="divide-y">
            {rows.map((issue) => (
              <IssueRow
                key={`${issue.rule}:${issue.line}`}
                issue={issue}
                workspaceSlug={workspaceSlug}
                projectId={projectId}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
