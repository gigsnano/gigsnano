"use client";

import { useState } from "react";

import {
  useCancelTransfer,
  usePendingTransfer,
  useRequestTransfer,
} from "@/hooks/project/use-projects";
import { useWorkspaces } from "@/hooks/auth/use-auth";
import { APIError } from "@/services/api-error";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { IProject } from "@/types";

const field =
  "h-9 w-full rounded-md border bg-background px-3 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function detailOf(err: unknown, fallback: string): string {
  if (
    err instanceof APIError &&
    err.data &&
    typeof err.data === "object" &&
    "detail" in err.data
  ) {
    return String((err.data as { detail: unknown }).detail);
  }
  return fallback;
}

/**
 * Danger-zone "Transfer project" section (GIN-85), modeled on GitHub's repo
 * transfer. The source admin names ANY destination workspace by slug and types
 * the project name to confirm; the destination OWNER is emailed and must accept
 * before anything moves. While a transfer is pending, this renders a banner with
 * a Cancel action instead of the trigger.
 */
export function TransferProjectDialog({
  workspaceSlug,
  workspaceName,
  project,
}: {
  workspaceSlug: string;
  workspaceName: string;
  project: IProject;
}) {
  const { data: pending } = usePendingTransfer(workspaceSlug, project.id);
  const request = useRequestTransfer(workspaceSlug, project.id);
  const cancel = useCancelTransfer(workspaceSlug, project.id);
  const workspaces = useWorkspaces();

  const [open, setOpen] = useState(false);
  const [destination, setDestination] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [error, setError] = useState<string | null>(null);

  const others = (workspaces.data ?? []).filter((w) => w.slug !== workspaceSlug);
  const confirmed = confirmName.trim() === project.name;
  const canSubmit = destination.trim().length > 0 && confirmed && !request.isPending;

  const openDialog = () => {
    setDestination("");
    setConfirmName("");
    setError(null);
    setOpen(true);
  };

  const onRequest = async () => {
    if (!canSubmit) return;
    setError(null);
    try {
      await request.mutateAsync({ destination_workspace_slug: destination.trim() });
      setOpen(false); // the pending banner takes over via query invalidation
    } catch (err) {
      setError(detailOf(err, "Transfer request failed. Please try again."));
    }
  };

  if (pending) {
    return (
      <div className="mt-8 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
        <h3 className="text-sm font-semibold">Transfer pending</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Waiting for the owner of{" "}
          <span className="font-medium text-foreground">{pending.dest_workspace_name}</span>{" "}
          (<span className="font-mono text-xs">{pending.invited_email}</span>) to accept the
          transfer of <span className="font-medium text-foreground">{project.name}</span>. Nothing
          moves until they do.
        </p>
        <div className="mt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate()}
          >
            {cancel.isPending ? "Cancelling…" : "Cancel transfer"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="mt-8 flex items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold">Transfer project</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Transfer this project to another workspace. Its owner will be asked to accept before
            the move happens.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={openDialog}>
          Transfer
        </Button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Transfer {project.name}</DialogTitle>
          <DialogDescription>
            The destination workspace&apos;s owner will receive an email and must accept before{" "}
            <span className="font-medium text-foreground">{project.name}</span> leaves{" "}
            <span className="font-medium text-foreground">{workspaceName}</span>. All work items,
            documents, and history move with it.
          </DialogDescription>

          <div className="mt-4 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Destination workspace slug
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className={field}
                placeholder="e.g. acme-labs"
                list="transfer-workspace-suggestions"
                aria-label="Destination workspace slug"
                autoComplete="off"
              />
              <datalist id="transfer-workspace-suggestions">
                {others.map((w) => (
                  <option key={w.id} value={w.slug}>
                    {w.name}
                  </option>
                ))}
              </datalist>
              <span className="text-xs font-normal text-muted-foreground">
                You don&apos;t need to be a member — the destination owner approves the transfer.
              </span>
            </label>

            <label className="flex flex-col gap-1.5 text-sm font-medium">
              <span>
                Type <span className="font-mono text-foreground">{project.name}</span> to confirm
              </span>
              <input
                value={confirmName}
                onChange={(e) => setConfirmName(e.target.value)}
                className={field}
                aria-label="Type the project name to confirm"
                autoComplete="off"
              />
            </label>

            {error ? <p className="text-sm text-destructive">{error}</p> : null}
          </div>

          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" size="sm" disabled={!canSubmit} onClick={onRequest}>
              {request.isPending ? "Sending…" : "Request transfer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
