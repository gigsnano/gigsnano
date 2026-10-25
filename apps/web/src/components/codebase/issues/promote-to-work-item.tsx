"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useCreateStory } from "@/hooks/story/use-stories";
import { EStoryType, type IIssue } from "@/types";

/** Turn a scan finding into work-item HTML. Plain, self-contained context so the
 * item still makes sense long after this particular scan is gone. */
function issueToDescription(issue: IIssue): string {
  const cwe = issue.cwe.length
    ? `<p><strong>CWE:</strong> ${issue.cwe.map((c) => `<code>${c}</code>`).join(", ")}</p>`
    : "";
  return [
    `<p>${issue.message}</p>`,
    `<p><strong>Location:</strong> <code>${issue.file}:${issue.line}</code></p>`,
    `<p><strong>Rule:</strong> <code>${issue.rule}</code> (${issue.severity})</p>`,
    cwe,
    `<p><em>Promoted from a static-analysis finding on the Codebase screen.</em></p>`,
  ]
    .filter(Boolean)
    .join("");
}

/** Short title: the rule's last segment reads better than its full dotted id
 * (`python.lang.security.audit.exec-detected` -> `exec-detected`). */
function issueToTitle(issue: IIssue): string {
  const shortRule = issue.rule.split(".").pop() || issue.rule;
  return `${shortRule} in ${issue.file}:${issue.line}`;
}

/**
 * Promotes one finding into a real work item.
 *
 * This is what stands in for SonarQube's per-issue status/assignee/bulk-change
 * machinery. Sonar needs that because it isn't a tracker and has nowhere to send a
 * finding; GigsNano is one, so the scan stays stateless (no issue-state table, no
 * cross-scan fingerprinting) and the workflow lives where workflow already lives.
 */
export function PromoteToWorkItem({
  workspaceSlug,
  projectId,
  issue,
}: {
  workspaceSlug: string;
  projectId: string;
  issue: IIssue;
}) {
  // Mutation state drives the UI directly -- no local useState mirror to fall out
  // of sync (and nothing for the React Compiler to memoize around).
  const create = useCreateStory(workspaceSlug, projectId);
  const created = create.data;

  if (created) {
    return (
      <Link
        href={`/${workspaceSlug}/projects/${projectId}/issues/${created.id}`}
        className="shrink-0 text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {created.code ?? "Created"} →
      </Link>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-2">
      {create.isError ? (
        <span className="text-xs text-destructive">Couldn&apos;t create</span>
      ) : null}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={create.isPending}
        aria-label={`Create a work item for ${issueToTitle(issue)}`}
        onClick={() =>
          create.mutate({
            title: issueToTitle(issue),
            description: issueToDescription(issue),
            type: EStoryType.Bug,
          })
        }
      >
        {create.isPending ? "Creating…" : create.isError ? "Retry" : "Create work item"}
      </Button>
    </div>
  );
}
