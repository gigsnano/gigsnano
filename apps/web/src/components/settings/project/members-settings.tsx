"use client";

import { ProjectMembersTable } from "@/components/settings/project/project-members-table";

export function ProjectMembersSettings({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">Members</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Manage who can access this project and what they can do. Roles are enforced
          server-side — Members deliver work, Admins configure the project, the Owner
          controls ownership and deletion.
        </p>
      </div>
      <ProjectMembersTable workspaceSlug={workspaceSlug} projectId={projectId} />
    </div>
  );
}
