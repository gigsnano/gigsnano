"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Settings02Icon } from "@hugeicons/core-free-icons";

import { FoundationArtifacts } from "@/components/foundation/foundation-artifacts";
import { FoundationProposal } from "@/components/foundation/foundation-proposal";
import { FoundationSetup } from "@/components/foundation/foundation-setup";
import { FoundationSummary } from "@/components/foundation/foundation-summary";
import { FoundationValidate } from "@/components/foundation/foundation-validate";
import { cn } from "@/lib/utils";
import { useFoundation } from "@/hooks/project/use-foundation";

export function FoundationView({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: foundation, isLoading, isError } = useFoundation(workspaceSlug, projectId);

  if (isLoading)
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="h-24 animate-pulse rounded-lg bg-muted" />
      </div>
    );
  if (isError)
    return <div className="p-6 text-sm text-destructive">Failed to load the Foundation.</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header>
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-foreground">Foundation</h1>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium",
              foundation
                ? "bg-primary/10 text-primary"
                : "bg-muted text-muted-foreground",
            )}
          >
            {foundation ? `Locked · v${foundation.version}` : "Not set up"}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          The locked stack, design system &amp; standards every agent run and marketplace
          freelancer must obey. Consistency is a gate, not a hope.
        </p>
      </header>

      {foundation ? (
        <>
          <FoundationProposal
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            foundation={foundation}
          />

          <FoundationSummary workspaceSlug={workspaceSlug} foundation={foundation} />

          {foundation.history.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="font-medium">Versions</span>
              {foundation.history.map((h) => (
                <span key={h.version} className="rounded-md bg-muted px-1.5 py-0.5 font-mono">
                  v{h.version}
                </span>
              ))}
              <span className="rounded-md bg-primary/10 px-1.5 py-0.5 font-mono font-medium text-primary">
                v{foundation.version} · current
              </span>
            </div>
          )}

          <details className="group rounded-lg border border-border bg-card">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <HugeiconsIcon
                icon={Settings02Icon}
                className="size-4 shrink-0 text-muted-foreground"
              />
              <span className="text-sm font-medium text-foreground">
                Change foundation &amp; loaded artifacts
              </span>
              <span className="ml-auto text-muted-foreground transition-transform duration-200 group-open:rotate-90">
                ›
              </span>
            </summary>
            <div className="space-y-6 border-t border-border p-4">
              <FoundationSetup
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                current={foundation}
              />
              <FoundationArtifacts
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                foundation={foundation}
              />
            </div>
          </details>

          <FoundationValidate
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            foundation={foundation}
          />
        </>
      ) : (
        <FoundationSetup workspaceSlug={workspaceSlug} projectId={projectId} current={null} />
      )}
    </div>
  );
}
