"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon, Delete02Icon, Add01Icon, AiBrain01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useCreateWorkflowRule,
  useDeleteWorkflowRule,
  useWorkflowRules,
} from "@/hooks/workflow/use-workflow";
import { BMAD_AGENTS } from "@/constants/bmad-agents";
import { STORY_STATUS_META, STORY_STATUS_ORDER } from "@/constants/story-meta";
import { EStoryStatus } from "@/types";
import type { IWorkflowRule, TApproverKind, TOnConcerns } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_OPTS = STORY_STATUS_ORDER;
const statusLabel = (s: string) =>
  s === "" ? "Any" : STORY_STATUS_META[s as EStoryStatus]?.label ?? s;
const CONCERNS: TOnConcerns[] = ["block", "warn", "allow"];
const CONCERNS_TONE: Record<TOnConcerns, string> = {
  block: "text-red-600 dark:text-red-400",
  warn: "text-amber-600 dark:text-amber-400",
  allow: "text-muted-foreground",
};

function approverName(kind: TApproverKind, ref: string) {
  if (kind === "persona") return BMAD_AGENTS.find((a) => a.id === ref)?.name ?? ref;
  return ref;
}

const select =
  "rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50";

export function WorkflowBuilder({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data, isPending, isError, refetch } = useWorkflowRules(workspaceSlug, projectId);
  const create = useCreateWorkflowRule(workspaceSlug, projectId);
  const del = useDeleteWorkflowRule(workspaceSlug, projectId);

  const [fromStatus, setFromStatus] = useState("");
  const [toStatus, setToStatus] = useState<EStoryStatus>(EStoryStatus.Done);
  const [kind, setKind] = useState<TApproverKind>("persona");
  const [ref, setRef] = useState("agent_qa");
  const [onConcerns, setOnConcerns] = useState<TOnConcerns>("block");

  const rules = data ?? [];

  const submit = () => {
    const approverRef = kind === "persona" ? ref : ref.trim();
    if (!approverRef) return;
    create.mutate({
      from_status: fromStatus,
      to_status: toStatus,
      approver_kind: kind,
      approver_ref: approverRef,
      on_concerns: onConcerns,
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Status flow */}
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_OPTS.map((s, i) => (
          <span key={s} className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-md border px-2.5 py-1 text-sm",
                STORY_STATUS_META[s].chip,
              )}
            >
              {STORY_STATUS_META[s].label}
            </span>
            {i < STATUS_OPTS.length - 1 ? (
              <HugeiconsIcon icon={ArrowRight01Icon} className="size-4 text-muted-foreground" />
            ) : null}
          </span>
        ))}
      </div>

      {/* Gate rules */}
      <section>
        <p className="mb-2 text-sm font-medium">Gated transitions</p>
        {isPending ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-14 rounded-lg" />
            ))}
          </div>
        ) : isError ? (
          <EmptyState
            assetKey="error"
            align="start"
            title="Couldn't load workflow rules"
            actions={[{ label: "Retry", onClick: () => refetch() }]}
          />
        ) : rules.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No gates yet. Add one below to require approval on a status move.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rules.map((r: IWorkflowRule) => (
              <li
                key={r.id}
                className="flex items-center gap-3 rounded-lg border bg-card p-3 text-sm"
              >
                <span className="flex items-center gap-1.5">
                  <span className="text-muted-foreground">{statusLabel(r.from_status)}</span>
                  <HugeiconsIcon icon={ArrowRight01Icon} className="size-3.5 text-muted-foreground" />
                  <span className="font-medium">{statusLabel(r.to_status)}</span>
                </span>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {r.approver_kind === "persona" ? (
                    <HugeiconsIcon icon={AiBrain01Icon} className="size-3.5" />
                  ) : null}
                  {approverName(r.approver_kind, r.approver_ref)}
                </span>
                <span className={cn("text-xs font-medium", CONCERNS_TONE[r.on_concerns as TOnConcerns])}>
                  on concerns: {r.on_concerns}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto"
                  aria-label="Delete rule"
                  onClick={() => del.mutate(r.id)}
                >
                  <HugeiconsIcon icon={Delete02Icon} className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Add rule */}
      <section className="rounded-xl border bg-card p-4">
        <p className="mb-3 text-sm font-medium">Add a gate</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            From
            <select
              value={fromStatus}
              onChange={(e) => setFromStatus(e.target.value)}
              className={select}
              aria-label="From status"
            >
              <option value="">Any</option>
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {STORY_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            To
            <select
              value={toStatus}
              onChange={(e) => setToStatus(e.target.value as EStoryStatus)}
              className={select}
              aria-label="To status"
            >
              {STATUS_OPTS.map((s) => (
                <option key={s} value={s}>
                  {STORY_STATUS_META[s].label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            Approver
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as TApproverKind;
                setKind(k);
                setRef(k === "persona" ? "agent_qa" : "");
              }}
              className={select}
              aria-label="Approver kind"
            >
              <option value="persona">AI persona</option>
              <option value="human">Human role</option>
            </select>
          </label>
          {kind === "persona" ? (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Persona
              <select
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                className={select}
                aria-label="Persona"
              >
                {BMAD_AGENTS.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Role
              <Input
                value={ref}
                onChange={(e) => setRef(e.target.value)}
                placeholder="e.g. admin"
                aria-label="Role name"
                className="h-8 w-28"
              />
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            On concerns
            <select
              value={onConcerns}
              onChange={(e) => setOnConcerns(e.target.value as TOnConcerns)}
              className={select}
              aria-label="On concerns"
            >
              {CONCERNS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <Button size="sm" onClick={submit} disabled={create.isPending}>
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Add gate
          </Button>
        </div>
      </section>
    </div>
  );
}
