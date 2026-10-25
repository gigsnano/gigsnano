"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { MoreHorizontalIcon, Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { useMembers, useUpdateMember, useRemoveMember } from "@/hooks/workspace/use-members";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import {
  useWorkspaceInvitations,
  useResendInvitation,
  useRevokeInvitation,
} from "@/hooks/workspace/use-invitations";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ASSIGNABLE_WORKSPACE_ROLES, WORKSPACE_ROLE_LABEL } from "@/constants/roles";
import { relativeTime } from "@/lib/format/relative-time";
import { cn } from "@/lib/utils";
import { EMemberStatus, EWorkspaceRole, type IWorkspaceMember } from "@/types";

import { InviteMembersDialog } from "./invite-members-dialog";

/** Status as the members table shows it. `Invited` covers both a pending
 *  membership and a live invitation — from the operator's point of view they
 *  are the same thing: someone who hasn't accepted yet. */
const STATUS_LABEL: Record<EMemberStatus, string> = {
  [EMemberStatus.Active]: "Active",
  [EMemberStatus.Pending]: "Invited",
};

const ROLE_FILTER_ALL = "all";

function StatusPill({ status }: { status: EMemberStatus }) {
  const pending = status === EMemberStatus.Pending;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        pending ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function MemberRow({
  member,
  workspaceSlug,
  onCopyLink,
  canManage,
}: {
  member: IWorkspaceMember;
  workspaceSlug: string;
  onCopyLink: (invitationId: string) => void;
  /** False for a plain member: the server refuses these writes with a 403, so
   *  offering the control at all can only end in an error the user can't act on. */
  canManage: boolean;
}) {
  const update = useUpdateMember(workspaceSlug);
  const remove = useRemoveMember(workspaceSlug);
  const revoke = useRevokeInvitation(workspaceSlug);
  const isOwner = member.role === EWorkspaceRole.Owner;
  const isPending = member.status === EMemberStatus.Pending;
  // A row with no user behind it is standing in for an invitation, so its id is
  // an invitation id — that is what makes resend and copy-link possible here.
  const isInvitation = !member.user_id;

  return (
    <tr className="border-b transition-colors last:border-0 hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium text-foreground">
              {member.display_name}
            </div>
            <div className="truncate text-xs text-muted-foreground">{member.email}</div>
          </div>
        </div>
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        {isOwner ? (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            Owner
          </span>
        ) : !canManage ? (
          <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
            {WORKSPACE_ROLE_LABEL[member.role]}
          </span>
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              disabled={update.isPending || isInvitation}
              aria-label={`Change role for ${member.display_name} (currently ${WORKSPACE_ROLE_LABEL[member.role]})`}
              className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
            >
              {WORKSPACE_ROLE_LABEL[member.role]}
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {ASSIGNABLE_WORKSPACE_ROLES.map((role) => (
                <DropdownMenuItem
                  key={role}
                  onSelect={() => update.mutate({ memberId: member.id, role })}
                >
                  <span className="flex-1">{WORKSPACE_ROLE_LABEL[role]}</span>
                  {role === member.role ? (
                    <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                  ) : null}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>

      <td className="whitespace-nowrap px-4 py-3">
        <StatusPill status={member.status} />
      </td>

      <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-muted-foreground sm:table-cell">
        {relativeTime(member.created_at)}
      </td>

      <td className="px-4 py-3 text-right">
        {isOwner || !canManage ? (
          <span className="inline-block size-7" />
        ) : (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={`Actions for ${member.display_name}`}
              className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {isInvitation ? (
                <>
                  <DropdownMenuItem onSelect={() => onCopyLink(member.id)}>
                    Copy invite link
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive focus:bg-destructive/10"
                    onSelect={() => revoke.mutate(member.id)}
                  >
                    Revoke invitation
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10"
                  onSelect={() => remove.mutate(member.id)}
                >
                  {isPending ? "Cancel invitation" : "Remove from workspace"}
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </td>
    </tr>
  );
}

/**
 * `table-fixed` is what keeps this table inside its frame.
 *
 * Under the default auto layout a cell grows to fit its content, so one long
 * address (a.very.long.member.name@example.com) widens the whole table past the
 * container and `overflow-x-auto` quietly clips the actions column off the
 * right edge. `truncate` on the inner div cannot prevent that — it only takes
 * effect once something bounds the cell, which is exactly what a fixed layout
 * plus these column widths do.
 */
function TableFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[34rem] table-fixed border-collapse text-left">
        <thead>
          <tr className="border-b bg-muted/40 text-xs font-medium text-muted-foreground">
            <th scope="col" className="px-4 py-2">Member</th>
            <th scope="col" className="w-32 px-4 py-2">Role</th>
            <th scope="col" className="w-28 px-4 py-2">Status</th>
            <th scope="col" className="hidden w-28 px-4 py-2 sm:table-cell">Joined</th>
            <th scope="col" className="w-16 px-4 py-2 text-right">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function MembersList({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: members, isPending, isError, refetch } = useMembers(workspaceSlug);
  const { data: invitations } = useWorkspaceInvitations(workspaceSlug);
  // Mirrors the server's `require_role(ADMIN, OWNER)` on every member write.
  // Without this the whole screen — invite, role, remove — is offered to a plain
  // member and every action comes back 403 as "try again", which it never can.
  const { isAdmin: canManage } = useWorkspaceRole(workspaceSlug);
  const resend = useResendInvitation(workspaceSlug);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>(ROLE_FILTER_ALL);
  const [statusFilter, setStatusFilter] = useState<string>(ROLE_FILTER_ALL);
  const [copied, setCopied] = useState<string | null>(null);

  /** Resending mints a new token, and that response is the only moment the raw
   *  link is knowable — so "copy link" goes through resend rather than reading
   *  a URL the list could never have contained. */
  function copyInviteLink(invitationId: string) {
    resend.mutate(invitationId, {
      onSuccess: (result) => {
        void navigator.clipboard?.writeText(result.invite_url);
        setCopied(invitationId);
        setTimeout(() => setCopied(null), 2000);
      },
    });
  }

  if (isPending) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex justify-end">
          <Skeleton className="h-8 w-32" />
        </div>
        <div className="divide-y rounded-lg border">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={`member-skeleton-${i}`} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-8 rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="size-7 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load members"
        description="Something went wrong fetching members. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  if (members.length === 0) {
    return (
      <div className="rounded-lg border">
        <EmptyState
          assetKey="members"
          title="Invite your team"
          description="Bring teammates in to collaborate on projects, sprints, and stories — and assign work to them or to AI agents."
          actions={[{ label: "Invite members" }]}
        />
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const visible = members.filter((m) => {
    if (roleFilter !== ROLE_FILTER_ALL && m.role !== roleFilter) return false;
    if (statusFilter !== ROLE_FILTER_ALL && m.status !== statusFilter) return false;
    if (!needle) return true;
    return (
      m.display_name.toLowerCase().includes(needle) || m.email.toLowerCase().includes(needle)
    );
  });

  const pendingCount = (invitations ?? []).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[12rem] flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            aria-label="Search members by name or email"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members…"
            className="h-8 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          />
        </div>

        <label htmlFor="member-role-filter" className="sr-only">
          Filter by role
        </label>
        <select
          id="member-role-filter"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value={ROLE_FILTER_ALL}>All roles</option>
          {Object.values(EWorkspaceRole).map((role) => (
            <option key={role} value={role}>
              {WORKSPACE_ROLE_LABEL[role]}
            </option>
          ))}
        </select>

        <label htmlFor="member-status-filter" className="sr-only">
          Filter by status
        </label>
        <select
          id="member-status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-8 rounded-md border bg-transparent px-2 text-xs text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value={ROLE_FILTER_ALL}>All statuses</option>
          {Object.values(EMemberStatus).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>

        {canManage ? <InviteMembersDialog workspaceSlug={workspaceSlug} /> : null}
      </div>

      {copied ? (
        <p role="status" className="text-xs text-primary">
          Invite link copied. The previous link for that person no longer works.
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="rounded-lg border">
          <EmptyState
            assetKey="search-empty"
            title="No members match"
            description="No one matches that search or those filters. Try a different name, or clear the filters."
            actions={[
              {
                label: "Clear filters",
                onClick: () => {
                  setQuery("");
                  setRoleFilter(ROLE_FILTER_ALL);
                  setStatusFilter(ROLE_FILTER_ALL);
                },
              },
            ]}
          />
        </div>
      ) : (
        <TableFrame>
          {visible.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              workspaceSlug={workspaceSlug}
              onCopyLink={copyInviteLink}
              canManage={canManage}
            />
          ))}
        </TableFrame>
      )}

      {pendingCount ? (
        <p className="text-xs text-muted-foreground">
          {pendingCount} pending invitation{pendingCount === 1 ? "" : "s"}. See{" "}
          <a href={`/${workspaceSlug}/settings/invitations`} className="underline">
            Invitations
          </a>{" "}
          for their full history.
        </p>
      ) : null}
    </div>
  );
}
