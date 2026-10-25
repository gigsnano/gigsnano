"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  ArrowDown01Icon,
  PlayIcon,
  Delete02Icon,
  CheckmarkCircle02Icon,
  Alert02Icon,
} from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import {
  useAutomationRuns,
  useDeleteAutomation,
  useDryRunAutomation,
  useUpdateAutomation,
} from "@/hooks/automation/use-automations";
import { relativeTime } from "@/lib/format/relative-time";
import type { IAutomationRule } from "@/types";
import { cn } from "@/lib/utils";

import { CompiledAst } from "./compiled-ast";

export function AutomationRuleCard({
  workspaceSlug,
  projectId,
  rule,
}: {
  workspaceSlug: string;
  projectId: string;
  rule: IAutomationRule;
}) {
  const update = useUpdateAutomation(workspaceSlug, projectId);
  const del = useDeleteAutomation(workspaceSlug, projectId);
  const dryRun = useDryRunAutomation(workspaceSlug, projectId);
  const [expanded, setExpanded] = useState(false);
  const { data: runs } = useAutomationRuns(workspaceSlug, projectId, expanded ? rule.id : "");

  return (
    <div className="rounded-xl border bg-card">
      <div className="flex items-center gap-3 p-4">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={expanded}
        >
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            className={cn(
              "size-4 shrink-0 text-muted-foreground transition-transform",
              expanded ? "rotate-0" : "-rotate-90",
            )}
          />
          <span className="min-w-0">
            <span className="block truncate font-medium">{rule.name}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {rule.trigger_event}
            </span>
          </span>
        </button>

        <button
          type="button"
          aria-pressed={rule.enabled}
          onClick={() => update.mutate({ ruleId: rule.id, payload: { enabled: !rule.enabled } })}
          className={cn(
            "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
            rule.enabled
              ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "border-border bg-muted text-muted-foreground",
          )}
        >
          {rule.enabled ? "Enabled" : "Disabled"}
        </button>
        <Button
          variant="ghost"
          size="sm"
          disabled={dryRun.isPending}
          onClick={() => {
            setExpanded(true);
            dryRun.mutate(rule.id);
          }}
        >
          <HugeiconsIcon icon={PlayIcon} className="size-4" />
          Test
        </Button>
        <Button variant="ghost" size="sm" aria-label="Delete automation" onClick={() => del.mutate(rule.id)}>
          <HugeiconsIcon icon={Delete02Icon} className="size-4" />
        </Button>
      </div>

      {expanded ? (
        <div className="border-t p-4">
          <CompiledAst ast={rule.ast} />
          <p className="mb-1.5 mt-4 text-xs font-medium text-muted-foreground">Run history</p>
          {runs && runs.length ? (
            <ul className="flex flex-col gap-1.5">
              {runs.map((run) => {
                const ok = run.status === "success" || run.status === "dry_run";
                return (
                  <li key={run.id} className="flex items-center gap-2 text-sm">
                    <HugeiconsIcon
                      icon={ok ? CheckmarkCircle02Icon : Alert02Icon}
                      className={cn("size-4", ok ? "text-emerald-500" : "text-red-500")}
                    />
                    <span className="capitalize">{run.status.replace("_", " ")}</span>
                    {run.dry_run ? (
                      <span className="rounded bg-muted px-1.5 text-xs text-muted-foreground">test</span>
                    ) : null}
                    <span className="text-muted-foreground">
                      · {run.actions_taken.length} action{run.actions_taken.length === 1 ? "" : "s"}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {relativeTime(run.created_at)}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Hasn&apos;t fired yet. Hit Test to dry-run it.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
