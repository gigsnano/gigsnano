"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Flowchart01Icon,
  DatabaseIcon,
  Analytics01Icon,
  ArrowRight01Icon,
  SquareLock02Icon,
} from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/project/use-projects";

// The truthful architecture views — already live in each project's Codebase
// feature (graph/ER/metrics over the code-intelligence APIs).
const VIEWS = [
  { icon: Flowchart01Icon, label: "System design", hint: "Dependency graph" },
  { icon: DatabaseIcon, label: "Data models", hint: "ER schema" },
  { icon: Analytics01Icon, label: "Metrics", hint: "Complexity · hotspots · churn" },
];

// Structured-architecture screens that need the GIA P3 backend (domains + metrics)
// before they can be truthful — flagged, not faked.
const PENDING = ["Components", "API contracts", "ADRs / tech decisions", "Compliance radar"];

/** Architect lens: routes to the real per-project architecture views and is
 * honest about the structured screens still waiting on GIA P3. */
export function ArchitectHub({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects, isPending, isError, refetch } = useProjects(workspaceSlug);

  if (isPending) {
    return (
      <div className="flex flex-col gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        align="start"
        title="Couldn't load projects"
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <p className="mb-2 text-sm font-medium">Architecture views</p>
        {projects?.length ? (
          <div className="flex flex-col gap-2">
            {projects.map((p) => (
              <Link
                key={p.id}
                href={`/${workspaceSlug}/projects/${p.id}/codebase`}
                className="group flex items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/40"
              >
                <span className="text-lg">{p.logo_emoji ?? "📁"}</span>
                <div className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="mt-1 flex flex-wrap gap-2">
                    {VIEWS.map((v) => (
                      <span
                        key={v.label}
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
                      >
                        <HugeiconsIcon icon={v.icon} className="size-3.5" />
                        {v.label}
                      </span>
                    ))}
                  </span>
                </div>
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
                />
              </Link>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No projects yet — connect a repo to explore its architecture.
          </p>
        )}
      </section>

      <section>
        <p className="mb-2 flex items-center gap-1.5 text-sm font-medium text-muted-foreground">
          <HugeiconsIcon icon={SquareLock02Icon} className="size-3.5" />
          Structured architecture
        </p>
        <div className="rounded-xl border border-dashed p-4">
          <p className="text-sm text-muted-foreground">
            Components, API contracts, ADRs, and the compliance radar arrive with the structured
            architecture backend (GIA P3). Today the graph, ER schema, and metrics above are the
            truthful, code-grounded views.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PENDING.map((label) => (
              <span
                key={label}
                className="rounded-full border border-border bg-muted px-2.5 py-0.5 text-xs text-muted-foreground"
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
