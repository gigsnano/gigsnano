"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import { useProject, useDeleteProject } from "@/hooks/project/use-projects";
import { useUpdateProject } from "@/hooks/project/use-project-settings";
import { useWorkspace } from "@/hooks/auth/use-auth";
import { useWorkspaceAdmin } from "@/hooks/workspace/use-workspace-admin";
import { useProjectPermissions } from "@/hooks/project/use-project-permissions";
import { EProjectPermission } from "@/lib/project-rbac";
import { TransferProjectDialog } from "./transfer-project-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { IProject, TPlanningMethod } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

const PLANNING_METHODS: { value: TPlanningMethod; label: string; hint: string }[] = [
  { value: "automatic", label: "Automatic", hint: "No estimates — forecast from throughput." },
  { value: "simple", label: "Simple sizes", hint: "XS / S / M / L / XL." },
  { value: "points", label: "Story points", hint: "Numeric points per item." },
  { value: "time", label: "Time estimates", hint: "Duration per item." },
];

/** Planning-method chooser (GIN-330). A change opens a confirmation explaining the
 *  effect before it's saved; the server enforces the MANAGE_SETTINGS permission. */
function PlanningMethodSection({
  project,
  update,
}: {
  project: IProject;
  update: ReturnType<typeof useUpdateProject>;
}) {
  const [pending, setPending] = useState<TPlanningMethod | null>(null);
  const current = project.planning_method;
  const pendingLabel = PLANNING_METHODS.find((m) => m.value === pending)?.label ?? "";

  const confirm = () => {
    if (!pending || update.isPending) return;
    update.mutate({ planning_method: pending }, { onSuccess: () => setPending(null) });
  };

  return (
    <section className="mt-10 border-t pt-8">
      <h3 className="text-sm font-semibold text-foreground">Planning method</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        How this project sizes work and reads forecasts. Automatic needs no estimates.
      </p>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {PLANNING_METHODS.map((m) => (
          <button
            key={m.value}
            type="button"
            aria-pressed={current === m.value}
            onClick={() => m.value !== current && setPending(m.value)}
            className={cn(
              "rounded-lg border px-3 py-2 text-left transition-colors",
              current === m.value ? "border-primary bg-primary/5" : "hover:bg-accent",
            )}
          >
            <div className="text-sm font-medium text-foreground">
              {m.label}
              {current === m.value ? <span className="ml-1.5 text-xs text-primary">Current</span> : null}
            </div>
            <div className="text-xs text-muted-foreground">{m.hint}</div>
          </button>
        ))}
      </div>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogTitle>Switch to {pendingLabel}?</DialogTitle>
          <DialogDescription>
            This changes how work items are sized and how forecasts and reporting read across the
            whole project. Existing estimates are kept, not converted or deleted.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={update.isPending} onClick={confirm}>
              {update.isPending ? "Switching…" : "Switch method"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ProjectGeneralSettingsForm({
  project,
  workspaceSlug,
  workspaceName,
  canTransfer,
  update,
  onDelete,
  isDeleting,
}: {
  project: IProject;
  workspaceSlug: string;
  workspaceName: string;
  canTransfer: boolean;
  update: ReturnType<typeof useUpdateProject>;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Delete is owner-only, server-enforced (GIN-318) — don't offer it to others.
  const canDelete = useProjectPermissions(workspaceSlug, project.id).can(
    EProjectPermission.DeleteProject,
  );
  const [name, setName] = useAdjustedState(project.name);
  const [identifier, setIdentifier] = useAdjustedState(project.identifier);
  const [description, setDescription] = useAdjustedState(project.description);
  const [hasUi, setHasUi] = useAdjustedState(project.has_ui);
  const [startDate, setStartDate] = useAdjustedState(project.start_date);
  const [targetDate, setTargetDate] = useAdjustedState(project.target_date);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await update.mutateAsync({
      name: name.trim(),
      identifier: identifier.trim(),
      description: description.trim(),
      has_ui: hasUi,
      start_date: startDate,
      target_date: targetDate,
    });
  };

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Project name
          <input required value={name} onChange={(e) => setName(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Identifier
          <input
            required
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value.toUpperCase())}
            className={field + " font-mono uppercase"}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className={field + " min-h-[5rem] py-2"}
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Target date
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className={field}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hasUi}
            onChange={(e) => setHasUi(e.target.checked)}
            className="size-4 rounded border"
          />
          <span>
            <span className="font-medium">Has UI?</span>
            <span className="ml-1 text-muted-foreground">
              Includes the UX design step in Sprint-0.
            </span>
          </span>
        </label>
        <div>
          <Button type="submit" size="sm" disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>

      <PlanningMethodSection project={project} update={update} />

      {canTransfer || canDelete ? (
        <div className="mt-10 border-t pt-8">
          <h3 className="text-sm font-semibold text-destructive">Danger zone</h3>

          {canTransfer ? (
            <TransferProjectDialog
              workspaceSlug={workspaceSlug}
              workspaceName={workspaceName}
              project={project}
            />
          ) : null}

          {canDelete ? (
            <div className={canTransfer ? "mt-8 border-t pt-8" : "mt-1"}>
              <p className="text-sm text-muted-foreground">
                Permanently delete this project and all of its cycles, modules, and stories.
              </p>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="mt-4"
                onClick={() => setDeleteOpen(true)}
              >
                Delete project
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogTitle>Delete project?</DialogTitle>
          <DialogDescription>
            This will permanently remove <span className="font-medium text-foreground">{project.name}</span>{" "}
            and all associated data. This action cannot be undone.
          </DialogDescription>
          <div className="mt-4 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={isDeleting}
              onClick={async () => {
                await onDelete();
                setDeleteOpen(false);
              }}
            >
              {isDeleting ? "Deleting…" : "Delete project"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ProjectGeneralSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const router = useRouter();
  const { data: project, isPending, isError } = useProject(workspaceSlug, projectId);
  const { data: workspace } = useWorkspace(workspaceSlug);
  const { isAdmin } = useWorkspaceAdmin(workspaceSlug);
  const update = useUpdateProject(workspaceSlug, projectId);
  const remove = useDeleteProject(workspaceSlug);

  const onDelete = async () => {
    await remove.mutateAsync(projectId);
    router.push(`/${workspaceSlug}/projects`);
  };

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        {/* name + identifier */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-9 w-full" />
          </div>
        ))}
        {/* description */}
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-20 w-full" />
        </div>
        {/* start + target date */}
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-1.5">
              <Skeleton className="h-3.5 w-20" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
        {/* has-ui checkbox row */}
        <div className="flex items-center gap-2">
          <Skeleton className="size-4" />
          <Skeleton className="h-3.5 w-64" />
        </div>
        <Skeleton className="h-8 w-28" />
        {/* danger zone */}
        <div className="mt-6 border-t pt-8">
          <Skeleton className="h-3.5 w-28" />
          <Skeleton className="mt-2 h-3.5 w-80" />
          <Skeleton className="mt-4 h-8 w-32" />
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <EmptyState
        assetKey="error"
        title="Project not found"
        description="This project doesn't exist or you don't have access."
      />
    );
  }

  return (
    <ProjectGeneralSettingsForm
      key={project.id}
      project={project}
      workspaceSlug={workspaceSlug}
      workspaceName={workspace?.name ?? workspaceSlug}
      canTransfer={isAdmin}
      update={update}
      onDelete={onDelete}
      isDeleting={remove.isPending}
    />
  );
}
