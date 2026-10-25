"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Add01Icon,
  MoreHorizontalIcon,
  Search01Icon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";

import {
  useProjectMembers,
  useAddProjectMember,
  useUpdateProjectMember,
  useRemoveProjectMember,
  useTransferProjectOwnership,
} from "@/hooks/project/use-project-members";
import { useProjectPermissions } from "@/hooks/project/use-project-permissions";
import { useProject } from "@/hooks/project/use-projects";
import { useMembers } from "@/hooks/workspace/use-members";
import {
  useWorkspaceInvitations,
  useRevokeInvitation,
} from "@/hooks/workspace/use-invitations";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import { EmptyState } from "@/components/empty-state";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { InviteMembersDialog } from "@/components/members/invite-members-dialog";
import { WorkspaceMemberPicker } from "@/components/members/workspace-member-picker";
import { ASSIGNABLE_PROJECT_ROLES, PROJECT_ROLE_LABEL } from "@/constants/roles";
import { projectMemberCandidates } from "@/lib/members/project-member-candidates";
import { pendingProjectInvitees, type IProjectInvitee } from "@/lib/members/project-invitees";
import { EProjectPermission } from "@/lib/project-rbac";
import { EMemberStatus, EProjectRole, type IProjectMember } from "@/types";

/** GIN-320/321: enterprise member-management table for Project Settings → Members.
 * Opens directly to a searchable list with true roles, status and permission-aware
 * actions. The server is the security boundary; controls the user can't use are
 * hidden. */
export function ProjectMembersTable({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: members, isPending, isError, refetch } = useProjectMembers(workspaceSlug, projectId);
  const perms = useProjectPermissions(workspaceSlug, projectId);
  const { data: invitations } = useWorkspaceInvitations(workspaceSlug);
  const { data: project } = useProject(workspaceSlug, projectId);
  // A seat is a workspace act (it is billing), so only a workspace admin/owner
  // may send one. The server enforces this; hiding the button keeps us from
  // offering an action that can only return 403.
  const { isAdmin: canInvite } = useWorkspaceRole(workspaceSlug);
  const [query, setQuery] = useState("");
  const [transferTarget, setTransferTarget] = useState<IProjectMember | null>(null);

  const canManage = perms.can(EProjectPermission.ManageMembers);
  const canTransfer = perms.can(EProjectPermission.TransferOwnership);

  if (isPending) {
    return (
      <div className="divide-y rounded-lg border">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !members) {
    return (
      <EmptyState
        assetKey="error"
        title="Couldn't load members"
        description="Something went wrong fetching project members. Please try again."
        actions={[{ label: "Retry", onClick: () => refetch() }]}
      />
    );
  }

  const ownerCount = members.filter(
    (m) => m.role === EProjectRole.Owner && m.status === EMemberStatus.Active,
  ).length;
  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter(
        (m) =>
          m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      )
    : members;

  // People with no account yet. They cannot hold a membership row, so the access
  // waits on the outstanding invitation and this is the only place it shows.
  const invitees = pendingProjectInvitees(invitations, projectId).filter(
    (i) => !q || i.email.toLowerCase().includes(q),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <HugeiconsIcon
            icon={Search01Icon}
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members by name or email"
            aria-label="Search members"
            className="pl-8"
          />
        </div>
        {canManage ? (
          <AddMemberControl workspaceSlug={workspaceSlug} projectId={projectId} members={members} />
        ) : null}
        {canInvite && project ? (
          <InviteMembersDialog
            workspaceSlug={workspaceSlug}
            project={{ id: projectId, name: project.name }}
            trigger={
              <Button size="sm" variant="secondary">
                Invite by email
              </Button>
            }
          />
        ) : null}
      </div>

      {filtered.length === 0 && invitees.length === 0 ? (
        <div className="rounded-lg border px-4 py-10 text-center text-sm text-muted-foreground">
          {q ? "No members match your search." : "No members yet."}
        </div>
      ) : (
        <div className="divide-y rounded-lg border">
          {filtered.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              canManage={canManage}
              canTransfer={canTransfer && member.status === EMemberStatus.Active}
              isLastOwner={member.role === EProjectRole.Owner && ownerCount <= 1}
              onTransfer={() => setTransferTarget(member)}
            />
          ))}
          {invitees.map((invitee) => (
            <InviteeRow
              key={invitee.invitation_id}
              invitee={invitee}
              workspaceSlug={workspaceSlug}
              canRevoke={canInvite}
            />
          ))}
        </div>
      )}

      <TransferOwnershipDialog
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        target={transferTarget}
        onClose={() => setTransferTarget(null)}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: EMemberStatus }) {
  if (status === EMemberStatus.Pending) {
    return (
      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
        Pending
      </span>
    );
  }
  return <span className="text-xs text-muted-foreground">Active</span>;
}

function MemberRow({
  member,
  workspaceSlug,
  projectId,
  canManage,
  canTransfer,
  isLastOwner,
  onTransfer,
}: {
  member: IProjectMember;
  workspaceSlug: string;
  projectId: string;
  canManage: boolean;
  canTransfer: boolean;
  isLastOwner: boolean;
  onTransfer: () => void;
}) {
  const update = useUpdateProjectMember(workspaceSlug, projectId);
  const remove = useRemoveProjectMember(workspaceSlug, projectId);
  const isOwner = member.role === EProjectRole.Owner;
  // Owner role is set via transfer, not the picker; the last owner can't be demoted.
  const roleEditable = canManage && !isOwner;

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={member.display_name} src={member.avatar_url} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{member.display_name}</div>
        <div className="truncate text-xs text-muted-foreground">{member.email}</div>
      </div>

      <div className="w-16 text-right">
        <StatusBadge status={member.status} />
      </div>

      {isOwner ? (
        <span className="w-24 text-center">
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            Owner
          </span>
        </span>
      ) : roleEditable ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            disabled={update.isPending}
            aria-label={`Change role for ${member.display_name}`}
            className="w-24 rounded-full bg-muted px-2.5 py-0.5 text-center text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {PROJECT_ROLE_LABEL[member.role]}
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            {ASSIGNABLE_PROJECT_ROLES.map((role) => (
              <DropdownMenuItem
                key={role}
                onSelect={() => update.mutate({ memberId: member.id, role })}
              >
                <span className="flex-1">{PROJECT_ROLE_LABEL[role]}</span>
                {role === member.role ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="w-24 text-center text-xs font-medium text-muted-foreground">
          {PROJECT_ROLE_LABEL[member.role]}
        </span>
      )}

      {canManage ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for ${member.display_name}`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canTransfer && !isOwner ? (
              <DropdownMenuItem onSelect={onTransfer}>Transfer ownership…</DropdownMenuItem>
            ) : null}
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              disabled={isLastOwner || remove.isPending}
              onSelect={() => {
                if (!isLastOwner) remove.mutate(member.id);
              }}
            >
              {isLastOwner ? "Last owner — transfer first" : "Remove from project"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7" />
      )}
    </div>
  );
}

/**
 * Someone invited to the workspace who joins this project on acceptance.
 *
 * Deliberately not a `MemberRow` with a flag: there is no membership behind it,
 * so role changes, ownership transfer and "remove from project" all have nothing
 * to write to. The only real action is revoking the invitation, which is a
 * workspace-level act.
 */
function InviteeRow({
  invitee,
  workspaceSlug,
  canRevoke,
}: {
  invitee: IProjectInvitee;
  workspaceSlug: string;
  canRevoke: boolean;
}) {
  const revoke = useRevokeInvitation(workspaceSlug);

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar name={invitee.email} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-foreground">{invitee.email}</div>
        <div className="truncate text-xs text-muted-foreground">
          Joins when they accept the workspace invitation
        </div>
      </div>

      <div className="w-16 text-right">
        <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-300">
          Invited
        </span>
      </div>

      <span className="w-24 text-center text-xs font-medium text-muted-foreground">
        {PROJECT_ROLE_LABEL[invitee.role]}
      </span>

      {canRevoke ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Actions for the invitation to ${invitee.email}`}
            className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
              disabled={revoke.isPending}
              onSelect={() => revoke.mutate(invitee.invitation_id)}
            >
              Revoke invitation
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="size-7" />
      )}
    </div>
  );
}

function AddMemberControl({
  workspaceSlug,
  projectId,
  members,
}: {
  workspaceSlug: string;
  projectId: string;
  members: IProjectMember[];
}) {
  const add = useAddProjectMember(workspaceSlug, projectId);
  const { data: workspaceMembers } = useMembers(workspaceSlug);
  const onProject = new Set(members.map((m) => m.user_id));
  const candidates = projectMemberCandidates(workspaceMembers ?? [], onProject);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="sm">
          <HugeiconsIcon icon={Add01Icon} className="size-4" />
          Add member
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80">
        <div className="mb-2 text-xs font-semibold text-muted-foreground">
          Add a workspace member
        </div>
        <WorkspaceMemberPicker
          candidates={candidates}
          isPending={add.isPending}
          onAddUser={(userId) => add.mutate({ user_id: userId })}
        />
        {add.isError ? (
          <p className="mt-2 text-xs text-destructive">Couldn&apos;t add member. Please try again.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

function TransferOwnershipDialog({
  workspaceSlug,
  projectId,
  target,
  onClose,
}: {
  workspaceSlug: string;
  projectId: string;
  target: IProjectMember | null;
  onClose: () => void;
}) {
  const transfer = useTransferProjectOwnership(workspaceSlug, projectId);
  return (
    <Dialog open={target !== null} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer ownership</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Make <span className="font-medium text-foreground">{target?.display_name}</span> the project
          owner? You will step down to Admin. This can only be undone by the new owner.
        </p>
        {transfer.isError ? (
          <p className="text-sm text-destructive">Transfer failed. Please try again.</p>
        ) : null}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={transfer.isPending}>
            Cancel
          </Button>
          <Button
            disabled={transfer.isPending || !target}
            onClick={() => {
              if (target) {
                transfer.mutate(target.user_id, { onSuccess: onClose });
              }
            }}
          >
            {transfer.isPending ? "Transferring…" : "Transfer ownership"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
