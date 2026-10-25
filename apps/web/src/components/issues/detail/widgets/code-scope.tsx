"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { IssueCollapsibleSection } from "@/components/issues/detail/shared/collapsible-section";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  useCodeScope,
  useConfirmCodeScope,
  useResetCodeScope,
  useSaveCodeScope,
} from "@/hooks/codebase/use-code-scope";
import { cn } from "@/lib/utils";
import { ECodeScopeStatus, ERepoScopeMode, type IRepoScope } from "@/types";

const MODES: { mode: ERepoScopeMode; label: string }[] = [
  { mode: ERepoScopeMode.Write, label: "Write" },
  { mode: ERepoScopeMode.Reference, label: "Reference" },
  { mode: ERepoScopeMode.Excluded, label: "Excluded" },
];

type TEdit = { mode?: ERepoScopeMode; required_delivery?: boolean; base_branch?: string };

/** Work-item Code scope (GIN-413): classify each bundle repo Write/Reference/Excluded,
 *  draft → confirm, pinned to a bundle version. Defaults open for technical items. */
export function IssueCodeScope({
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
  const { data: scope, isLoading } = useCodeScope(workspaceSlug, projectId, storyId);
  const save = useSaveCodeScope(workspaceSlug, projectId, storyId);
  const confirm = useConfirmCodeScope(workspaceSlug, projectId, storyId);
  const reset = useResetCodeScope(workspaceSlug, projectId, storyId);

  // Local overlay of unsaved edits, keyed by repo id. Cleared when the query refetches.
  const [edits, setEdits] = useState<Record<string, TEdit>>({});
  const dirty = Object.keys(edits).length > 0;
  const busy = save.isPending || confirm.isPending || reset.isPending;

  if (isLoading || !scope) {
    return (
      <IssueCollapsibleSection title="Code scope" defaultOpen={defaultOpen}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </IssueCollapsibleSection>
    );
  }

  if (!scope.has_default_bundle) {
    return (
      <IssueCollapsibleSection title="Code scope" defaultOpen={defaultOpen}>
        <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
          No default System Bundle for this project. Create one and set it as default under
          <span className="font-medium text-foreground"> Codebase → Bundles</span> to scope agent work across repositories.
        </p>
      </IssueCollapsibleSection>
    );
  }

  const modeOf = (r: IRepoScope) => edits[r.project_repository_id]?.mode ?? r.mode;
  const requiredOf = (r: IRepoScope) =>
    edits[r.project_repository_id]?.required_delivery ?? r.required_delivery;
  const branchOf = (r: IRepoScope) => edits[r.project_repository_id]?.base_branch ?? r.base_branch;

  function patch(id: string, p: TEdit) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...p } }));
  }

  function payload() {
    return {
      repositories: scope!.repositories.map((r) => ({
        project_repository_id: r.project_repository_id,
        mode: modeOf(r),
        required_delivery: requiredOf(r),
        base_branch: branchOf(r),
        reason: r.reason,
      })),
    };
  }

  async function onSave() {
    await save.mutateAsync(payload());
    setEdits({});
  }
  async function onConfirm() {
    if (dirty) await save.mutateAsync(payload());
    await confirm.mutateAsync();
    setEdits({});
  }
  async function onReset() {
    await reset.mutateAsync();
    setEdits({});
  }

  const confirmed = scope.status === ECodeScopeStatus.Confirmed && !dirty;

  return (
    <IssueCollapsibleSection
      title="Code scope"
      defaultOpen={defaultOpen}
      action={
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
            confirmed
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : "bg-muted text-muted-foreground",
          )}
        >
          {confirmed ? <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-3" /> : null}
          {confirmed ? "Confirmed" : "Draft"}
        </span>
      }
    >
      <div className="space-y-3">
        {scope.bundle_version != null ? (
          <p className="text-xs text-muted-foreground">
            Bundle version v{scope.bundle_version} · branch <code className="text-foreground">{scope.branch_pattern}</code>
          </p>
        ) : null}

        <div className="space-y-1.5">
          {scope.repositories.map((r) => {
            const mode = modeOf(r);
            return (
              <div key={r.project_repository_id} className="rounded-md border p-2">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">
                    {r.display_name || r.project_repository_id}
                  </span>
                  <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                    {MODES.map((m) => (
                      <button
                        key={m.mode}
                        type="button"
                        onClick={() => patch(r.project_repository_id, { mode: m.mode })}
                        className={cn(
                          "rounded px-2 py-0.5 text-xs transition-colors",
                          mode === m.mode
                            ? "bg-card font-medium text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>
                {mode === ERepoScopeMode.Write ? (
                  <div className="mt-2 flex items-center gap-3 pl-0.5">
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Checkbox
                        checked={requiredOf(r)}
                        onCheckedChange={(v) =>
                          patch(r.project_repository_id, { required_delivery: Boolean(v) })
                        }
                        aria-label="Required delivery"
                      />
                      Required delivery
                    </label>
                    <Input
                      value={branchOf(r)}
                      onChange={(e) => patch(r.project_repository_id, { base_branch: e.target.value })}
                      aria-label="Base branch"
                      className="h-7 w-40 text-xs"
                    />
                  </div>
                ) : null}
              </div>
            );
          })}
          {scope.repositories.length === 0 ? (
            <p className="text-sm text-muted-foreground">The default bundle has no repositories.</p>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Button size="sm" onClick={onConfirm} disabled={busy}>
            {confirm.isPending ? "Confirming…" : dirty ? "Save & confirm" : confirmed ? "Re-confirm" : "Confirm code scope"}
          </Button>
          {dirty ? (
            <Button size="sm" variant="outline" onClick={onSave} disabled={busy}>
              Save draft
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={onReset} disabled={busy} className="ml-auto">
            Reset to bundle defaults
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Confirm before an agent runs — it may write only to approved Write repositories. Reference→Write changes are audited.
        </p>
      </div>
    </IssueCollapsibleSection>
  );
}
