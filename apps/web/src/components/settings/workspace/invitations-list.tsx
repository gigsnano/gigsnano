"use client";

import {
  useWorkspaceInvitations,
  useResendInvitation,
  useRevokeInvitation,
} from "@/hooks/workspace/use-invitations";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { WORKSPACE_ROLE_LABEL } from "@/constants/roles";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import { EInvitationStatus } from "@/types";

const STATUS_LABEL: Record<EInvitationStatus, string> = {
  [EInvitationStatus.Pending]: "Pending",
  [EInvitationStatus.Accepted]: "Accepted",
  [EInvitationStatus.Expired]: "Expired",
  [EInvitationStatus.Revoked]: "Revoked",
  [EInvitationStatus.DeliveryFailed]: "Delivery failed",
};

/** Only two tones: "still in play" and "not". Colour-coding all five states
 *  would imply a severity ranking that doesn't exist — expired and revoked are
 *  equally over, and delivery-failed is the only one that is actually wrong. */
function InvitationStatusPill({ status }: { status: EInvitationStatus }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
        status === EInvitationStatus.Pending && "bg-primary/10 text-primary",
        status === EInvitationStatus.Accepted && "bg-muted text-foreground",
        status === EInvitationStatus.DeliveryFailed && "bg-destructive/10 text-destructive",
        (status === EInvitationStatus.Expired || status === EInvitationStatus.Revoked) &&
          "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function WorkspaceInvitationsList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data, isPending, isError, refetch } = useWorkspaceInvitations(workspaceSlug);
  const revoke = useRevokeInvitation(workspaceSlug);
  const resend = useResendInvitation(workspaceSlug);
  const { isAdmin: canManage } = useWorkspaceRole(workspaceSlug);

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="mt-2 h-4 w-80" />
        <ul className="mt-6 divide-y rounded-lg border bg-card">
          {Array.from({ length: 3 }).map((_, i) => (
            <li key={i} className="flex items-center justify-between gap-4 px-4 py-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-56" />
              </div>
              <Skeleton className="h-8 w-16" />
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load invitations"
          description="Something went wrong fetching pending invites."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const invites = data ?? [];

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Invitations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every invitation and what became of it. Members is where you manage who has
        access — this is the history behind it.
      </p>

      {invites.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            assetKey="generic"
            title="No invitations yet"
            description={
              canManage
                ? "Invitations you send appear here with their status, so you can resend or revoke them."
                : "Invitations sent by an admin appear here with their status."
            }
            // A member can't invite, so the usual CTA would be a dead end —
            // send them to the list they *can* read instead of a button that
            // isn't there when they arrive.
            actions={[
              {
                label: canManage ? "Invite members" : "View members",
                href: `/${workspaceSlug}/settings/members`,
              },
            ]}
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y rounded-lg border bg-card">
          {invites.map((inv) => {
            const isPending = inv.status === EInvitationStatus.Pending;
            return (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <InvitationStatusPill status={inv.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {WORKSPACE_ROLE_LABEL[inv.role]} · invited by {inv.invited_by_name} ·{" "}
                    {relativeTime(inv.last_sent_at ?? inv.created_at)}
                    {isPending ? ` · expires ${relativeTime(inv.expires_at)}` : ""}
                    {inv.resend_count > 0
                      ? ` · resent ${inv.resend_count}×`
                      : ""}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {/* Resending is offered for anything not already accepted —
                      it revives an expired or revoked invitation with a fresh
                      token, which is the natural "try again" for all of them.
                      Both endpoints are admin-only, so a member sees the list
                      without controls rather than buttons that 403. */}
                  {canManage && inv.status !== EInvitationStatus.Accepted ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={resend.isPending}
                      onClick={() => resend.mutate(inv.id)}
                    >
                      Resend
                    </Button>
                  ) : null}
                  {canManage && isPending ? (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={revoke.isPending}
                      onClick={() => revoke.mutate(inv.id)}
                    >
                      Revoke
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
