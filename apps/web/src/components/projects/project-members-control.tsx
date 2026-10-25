"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, MoreHorizontalIcon, Tick02Icon } from "@hugeicons/core-free-icons";

import {
  useProjectMembers,
  useAddProjectMember,
  useUpdateProjectMember,
  useRemoveProjectMember,
} from "@/hooks/project/use-project-members";
import { useMembers } from "@/hooks/workspace/use-members";
import {
  useWorkspaceInvitations,
  useRevokeInvitation,
} from "@/hooks/workspace/use-invitations";
import { useProject } from "@/hooks/project/use-projects";
import { useProjectPermissions } from "@/hooks/project/use-project-permissions";
import { useWorkspaceRole } from "@/hooks/workspace/use-workspace-role";
import { Avatar } from "@/components/ui/avatar";
import { AvatarGroup } from "@/components/ui/avatar-group";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ASSIGNABLE_PROJECT_ROLES, PROJECT_ROLE_LABEL } from "@/constants/roles";
import { projectMemberCandidates } from "@/lib/members/project-member-candidates";
import { pendingProjectInvitees } from "@/lib/members/project-invitees";
import { EProjectPermission } from "@/lib/project-rbac";
import { EMemberStatus, type IMemberPreview } from "@/types";

import { InviteMembersDialog } from "../members/invite-members-dialog";
import { WorkspaceMemberPicker } from "../members/workspace-member-picker";

export function ProjectMembersControl({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const { data: members } = useProjectMembers(workspaceSlug, projectId);
  const { data: workspaceMembers } = useMembers(workspaceSlug);
  const { data: invitations } = useWorkspaceInvitations(workspaceSlug);
  const { data: project } = useProject(workspaceSlug, projectId);
  const { can } = useProjectPermissions(workspaceSlug, projectId);
  // Sending an invitation is a workspace act — it takes a seat, which is billing
  // — so a project lead who is not a workspace admin picks from the pool instead
  // of minting one. The server enforces the same rule; this only avoids offering
  // a button that can only ever return 403.
  const { isAdmin: canInvite } = useWorkspaceRole(workspaceSlug);
  const canManageMembers = can(EProjectPermission.ManageMembers);
  const add = useAddProjectMember(workspaceSlug, projectId);
  const update = useUpdateProjectMember(workspaceSlug, projectId);
  const remove = useRemoveProjectMember(workspaceSlug, projectId);
  const revoke = useRevokeInvitation(workspaceSlug);

  const list = members ?? [];
  // Avatar stack mirrors the project card, which counts ACTIVE members only
  // (the card's member_count/preview exclude pending invites).
  const preview: IMemberPreview[] = [];
  const memberUserIds = new Set<string>();
  for (const member of list) {
    memberUserIds.add(member.user_id);
    if (member.status === EMemberStatus.Active) {
      preview.push({
        id: member.user_id,
        display_name: member.display_name,
        avatar_url: member.avatar_url,
      });
    }
  }

  // Candidates come from the workspace pool, invited members included (GIN-528).
  // Backend only accepts workspace members here, so sourcing from the directory
  // 404'd silently ("nothing happens" on click) — GIN-10.
  const candidates = projectMemberCandidates(workspaceMembers ?? [], memberUserIds);
  // People with no account yet: they cannot hold a membership row, so their
  // project access lives on the outstanding invitation until it is redeemed.
  const invitees = pendingProjectInvitees(invitations, projectId);

  return (
    <div className="flex items-center gap-3">
      <AvatarGroup members={preview} max={5} />

      {/* Add/re-role/remove are `require_project_permission(MANAGE_MEMBERS)`.
          `can()` honours the workspace Owner/Admin override, so a project lead
          who is only a workspace member still gets the control — a plain
          member gets the avatar stack and no Manage button. */}
      {!canManageMembers ? null : (
      <Popover>
        <PopoverTrigger asChild>
          <Button size="sm" variant="secondary">
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            Manage
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-96">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Project members · {list.length}
            </span>
            {canInvite && project ? (
              <InviteMembersDialog
                workspaceSlug={workspaceSlug}
                project={{ id: projectId, name: project.name }}
                trigger={
                  <button
                    type="button"
                    className="rounded-md px-1.5 py-0.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
                  >
                    Invite by email
                  </button>
                }
              />
            ) : null}
          </div>

          <div className="mb-3 max-h-56 divide-y overflow-y-auto rounded-md border">
            {list.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={m.display_name} src={m.avatar_url} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {m.display_name}
                  </div>
                  {m.status === EMemberStatus.Pending ? (
                    <span className="text-xs text-amber-600 dark:text-amber-300">Pending</span>
                  ) : (
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  )}
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground">
                    {PROJECT_ROLE_LABEL[m.role]}
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    {ASSIGNABLE_PROJECT_ROLES.map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onSelect={() => update.mutate({ memberId: m.id, role })}
                      >
                        <span className="flex-1">{PROJECT_ROLE_LABEL[role]}</span>
                        {role === m.role ? (
                          <HugeiconsIcon icon={Tick02Icon} className="size-3.5 text-primary" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                    <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem
                      className="text-destructive focus:bg-destructive/10"
                      onSelect={() => remove.mutate(m.id)}
                    >
                      Remove from project
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}

            {/* No membership row exists for these yet — there is no account to
                point one at. The row is the invitation, so the only action is
                revoking it, and the role dropdown would have nothing to write. */}
            {invitees.map((invitee) => (
              <div key={invitee.invitation_id} className="flex items-center gap-2.5 px-2.5 py-2">
                <Avatar name={invitee.email} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-foreground">
                    {invitee.email}
                  </div>
                  <span className="text-xs text-amber-600 dark:text-amber-300">
                    Invited · joins as {PROJECT_ROLE_LABEL[invitee.role].toLowerCase()} when
                    they accept
                  </span>
                </div>

                {canInvite ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      aria-label={`Actions for the invitation to ${invitee.email}`}
                      className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <HugeiconsIcon icon={MoreHorizontalIcon} className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem
                        className="text-destructive focus:bg-destructive/10"
                        onSelect={() => revoke.mutate(invitee.invitation_id)}
                      >
                        Revoke invitation
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </div>
            ))}
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
      )}
    </div>
  );
}
