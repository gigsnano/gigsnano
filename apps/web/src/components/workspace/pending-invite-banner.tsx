"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useWorkspaces } from "@/hooks/auth/use-auth";
import { useProjects } from "@/hooks/project/use-projects";
import { usePendingInvites, useAcceptPendingInvite } from "@/hooks/workspace/use-members";
import { postAcceptDestination } from "@/lib/auth/post-accept-destination";
import { authErrorMessage } from "@/lib/auth/auth-error";
import { Button } from "@/components/ui/button";
import type { IWorkspaceMember } from "@/types";

/** Banner for workspace invites matching the signed-in user's email. */
export function PendingInviteBanner() {
  const invites = usePendingInvites();
  const workspaces = useWorkspaces();
  // Set once accepted, which is also what unblocks the projects query below —
  // the workspace 403s every request until the membership goes active.
  const [acceptedSlug, setAcceptedSlug] = useState<string | null>(null);

  if (invites.isPending || !invites.data?.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {acceptedSlug ? <RedirectAfterAccept workspaceSlug={acceptedSlug} /> : null}
      {invites.data.map((invite) => (
        <InviteRow
          key={invite.id}
          invite={invite}
          workspaceName={
            workspaces.data?.find((w) => w.slug === invite.workspace_slug)?.name ??
            invite.workspace_slug
          }
          onAccepted={() => setAcceptedSlug(invite.workspace_slug)}
        />
      ))}
    </div>
  );
}

/**
 * Sends the new member on once their project list has landed (GIN-529).
 *
 * react-doctor's nextjs-no-client-side-redirect flags the effect below. Its
 * three remedies all need the destination known before the client renders, and
 * here it cannot be: the membership only goes active when the accept mutation
 * resolves, and the project list 403s until that moment. This renders null, so
 * there is no wrong page to flash — the invite card stays put until the move.
 */
function RedirectAfterAccept({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const { data: projects } = useProjects(workspaceSlug);
  const destination = postAcceptDestination(workspaceSlug, projects);

  useEffect(() => {
    if (destination) router.replace(destination);
  }, [destination, router]);

  return null;
}

function InviteRow({
  invite,
  workspaceName,
  onAccepted,
}: {
  invite: IWorkspaceMember;
  workspaceName: string;
  onAccepted: () => void;
}) {
  const accept = useAcceptPendingInvite();

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-semibold">Workspace invitation</p>
        <p className="text-sm text-muted-foreground">
          You&apos;ve been invited to join{" "}
          <span className="font-medium text-foreground">{workspaceName}</span>.
        </p>
        {/* Chiefly the unverified-email refusal, which is recoverable and says
            how — a silent no-op button is the one thing this must not be. */}
        {accept.isError ? (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {authErrorMessage(accept.error)}
          </p>
        ) : null}
      </div>
      <Button
        size="sm"
        disabled={accept.isPending}
        onClick={() => accept.mutate(invite, { onSuccess: onAccepted })}
      >
        {accept.isPending ? "Accepting…" : "Accept invite"}
      </Button>
    </div>
  );
}
