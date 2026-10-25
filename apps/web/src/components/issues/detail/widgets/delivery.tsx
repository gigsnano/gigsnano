"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Alert02Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  useCancelDelivery,
  useCreateDelivery,
  useDelivery,
  useUpdateDeliveryRepo,
} from "@/hooks/codebase/use-delivery";
import { APIError } from "@/services/api-error";
import { cn } from "@/lib/utils";
import {
  ECiState,
  EMergeState,
  EReviewState,
  type IDeliveryRepo,
  type TDeliveryState,
} from "@/types";

const STATE_META: Record<TDeliveryState, { label: string; tone: string }> = {
  scope_proposed: { label: "Scope proposed", tone: "bg-muted text-muted-foreground" },
  in_development: { label: "In development", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  partially_ready: { label: "Partially ready", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ready_to_merge: { label: "Ready to merge", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  partially_merged: { label: "Partially merged", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  released: { label: "Released", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  rollback_required: { label: "Rollback required", tone: "bg-destructive/10 text-destructive" },
  cancelled: { label: "Cancelled", tone: "bg-muted text-muted-foreground" },
};

const MERGE_OPTIONS = [EMergeState.Pending, EMergeState.Ready, EMergeState.Merged, EMergeState.Blocked];

/**
 * A check result as icon + word (GIN-483). Colour alone would tell a reader who
 * cannot distinguish red from green that a failing build is fine.
 */
function CheckCell({ label, ok, bad }: { label: string; ok: boolean; bad: boolean }) {
  if (label === "none") return <span className="text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1",
        bad
          ? "text-destructive"
          : ok
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-muted-foreground",
      )}
    >
      <HugeiconsIcon
        icon={bad ? Alert02Icon : ok ? CheckmarkCircle02Icon : Clock01Icon}
        className="size-3.5 shrink-0"
        aria-hidden
      />
      {label.replace("_", " ")}
    </span>
  );
}

export function IssueDelivery({
  storyId,
  workspaceSlug,
  projectId,
  defaultOpen = true,
}: {
  storyId: string;
  workspaceSlug: string;
  projectId: string;
  defaultOpen?: boolean;
}) {
  const { data: delivery, isLoading, isError, error } = useDelivery(workspaceSlug, projectId, storyId);
  const create = useCreateDelivery(workspaceSlug, projectId, storyId);
  const cancel = useCancelDelivery(workspaceSlug, projectId, storyId);
  const updateRepo = useUpdateDeliveryRepo(workspaceSlug, projectId, storyId);
  const [createError, setCreateError] = useState<string | null>(null);

  const busy = create.isPending || cancel.isPending || updateRepo.isPending;

  async function onCreate() {
    if (busy) return;
    setCreateError(null);
    try {
      await create.mutateAsync();
    } catch (e) {
      setCreateError(
        e instanceof APIError && e.status === 409
          ? "Confirm the Code scope above before starting delivery."
          : "Couldn't start delivery.",
      );
    }
  }
  async function onCancel() {
    if (busy) return;
    await cancel.mutateAsync();
  }
  function patchRepo(repoId: string, payload: Parameters<typeof updateRepo.mutate>[0]["payload"]) {
    if (busy) return;
    updateRepo.mutate({ repoId, payload });
  }

  if (isLoading) {
    return (
      <IssueCollapsibleSection title="Delivery" defaultOpen={defaultOpen}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </IssueCollapsibleSection>
    );
  }

  // 404 → no delivery bundle yet.
  if (isError || !delivery) {
    const isNotFound = error instanceof APIError && error.status === 404;
    return (
      <IssueCollapsibleSection title="Delivery" defaultOpen={defaultOpen}>
        {/* One compact row, not a bordered empty card — the redesign bans the
            nested-card maze, and an empty section is the worst offender. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span>
            {isNotFound
              ? "Branches, PRs and merges across this item's Write repositories will appear here."
              : "Couldn't load delivery."}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs active:scale-[0.97]"
            onClick={onCreate}
            disabled={busy}
          >
            {create.isPending ? "Starting…" : "Start delivery"}
          </Button>
        </div>
        {createError ? (
          <p role="alert" className="mt-1 flex items-center gap-1.5 text-xs text-destructive">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" aria-hidden />
            {createError}
          </p>
        ) : null}
      </IssueCollapsibleSection>
    );
  }

  const meta = STATE_META[delivery.overall_state];

  return (
    <IssueCollapsibleSection
      title="Delivery"
      count={delivery.repositories.length}
      defaultOpen={defaultOpen}
      action={
        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium", meta.tone)}>
          {delivery.overall_state === "released" ? (
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" />
          ) : null}
          {meta.label}
        </span>
      }
    >
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Coordinated branch <code className="text-foreground">{delivery.branch_name}</code>
        </p>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2 font-medium">Repository</th>
                <th className="px-3 py-2 font-medium">Branch / PR</th>
                <th className="px-3 py-2 font-medium">Tests</th>
                <th className="px-3 py-2 font-medium">Review</th>
                <th className="px-3 py-2 font-medium">Merge</th>
              </tr>
            </thead>
            <tbody>
              {delivery.repositories.map((r) => (
                <DeliveryRow key={r.project_repository_id} repo={r} onPatch={patchRepo} busy={busy} />
              ))}
              {delivery.repositories.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-3 text-center text-muted-foreground">
                    No Write repositories in scope.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        {delivery.blocking_repo_ids.length > 0 && !delivery.cancelled ? (
          <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
            <HugeiconsIcon icon={Alert02Icon} className="size-3.5 shrink-0" aria-hidden />
            {delivery.blocking_repo_ids.length} required repository
            {delivery.blocking_repo_ids.length === 1 ? "" : "ies"} not yet merged — blocks marking this work item Done.
          </p>
        ) : null}

        {!delivery.cancelled && delivery.overall_state !== "released" ? (
          <Button size="sm" variant="ghost" onClick={onCancel} disabled={busy} className="text-muted-foreground">
            Cancel delivery
          </Button>
        ) : null}
      </div>
    </IssueCollapsibleSection>
  );
}

function DeliveryRow({
  repo,
  onPatch,
  busy,
}: {
  repo: IDeliveryRepo;
  onPatch: (repoId: string, payload: { merge_state?: EMergeState; no_change?: boolean }) => void;
  busy: boolean;
}) {
  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-2.5">
        <div className="font-medium text-foreground">{repo.display_name || repo.project_repository_id}</div>
        <label className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Checkbox
            checked={repo.no_change}
            onCheckedChange={(v) => onPatch(repo.project_repository_id, { no_change: Boolean(v) })}
            aria-label="No change required"
          />
          No change required
        </label>
      </td>
      <td className="px-3 py-2.5 text-xs">
        {repo.pr_url ? (
          <a href={repo.pr_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            {repo.pr_id ? `PR ${repo.pr_id}` : "PR"}
            <HugeiconsIcon icon={LinkSquare02Icon} className="size-3" />
          </a>
        ) : (
          <span className="text-muted-foreground">{repo.head_branch || "—"}</span>
        )}
      </td>
      <td className="px-3 py-2.5 text-xs">
        <CheckCell
          label={repo.ci_state}
          ok={repo.ci_state === ECiState.Passed}
          bad={repo.ci_state === ECiState.Failed}
        />
      </td>
      <td className="px-3 py-2.5 text-xs">
        <CheckCell
          label={repo.review_state}
          ok={repo.review_state === EReviewState.Approved}
          bad={repo.review_state === EReviewState.ChangesRequested}
        />
      </td>
      <td className="px-3 py-2.5">
        {repo.no_change ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <select
            value={repo.merge_state}
            onChange={(e) => onPatch(repo.project_repository_id, { merge_state: e.target.value as EMergeState })}
            disabled={busy}
            aria-label="Merge state"
            className="h-7 rounded-md border bg-input/30 px-1.5 text-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {MERGE_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </td>
    </tr>
  );
}
