import type { IPlatformUserDetail } from "@/types";

export function UserDetailStats({ user }: { user: IPlatformUserDetail }) {
  const stats = [
    { label: "Workspaces", value: user.workspace_count },
    { label: "Projects", value: user.project_count },
    { label: "Assigned stories", value: user.assigned_story_count },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-border bg-muted/20 px-3 py-2.5 text-center"
        >
          <p className="text-lg font-semibold tabular-nums text-foreground">{stat.value}</p>
          <p className="text-xs text-muted-foreground">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
