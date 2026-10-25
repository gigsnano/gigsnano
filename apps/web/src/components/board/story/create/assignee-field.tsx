"use client";
import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { UserAdd01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Avatar } from "@/components/ui/avatar";
import { PropertyPill } from "@/components/issues/shared/property-pill";
import { useMembers } from "@/hooks/workspace/use-members";
import { EMemberStatus } from "@/types";

export function AssigneeField({ workspaceSlug, projectId, value, onChange }: {
  workspaceSlug: string; projectId: string; value: string | null; onChange: (v: string | null) => void;
}) {
  // Assignment is workspace-scoped — candidates are the workspace's active members.
  void projectId;
  const { data: members } = useMembers(workspaceSlug);
  const [query, setQuery] = useState("");
  const active = (members ?? []).filter((m) => m.status === EMemberStatus.Active);
  const current = active.find((m) => m.user_id === value);
  const q = query.trim().toLowerCase();
  const filtered = !q
    ? active
    : active.filter(
        (m) => m.display_name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q),
      );
  return (
    <DropdownMenu onOpenChange={(open) => !open && setQuery("")}>
      <DropdownMenuTrigger asChild>
        <PropertyPill
          active={!!current}
          icon={current
            ? <Avatar name={current.display_name} src={current.avatar_url} size="xs" />
            : <HugeiconsIcon icon={UserAdd01Icon} className="size-3.5" />}
        >
          {current ? current.display_name : "Assignees"}
        </PropertyPill>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60 p-0">
        <div className="flex items-center gap-2 border-b px-2.5 py-2">
          <HugeiconsIcon icon={Search01Icon} className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search members…"
            aria-label="Search members to assign"
            className="h-5 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-56 overflow-y-auto p-1">
          <DropdownMenuItem onSelect={() => onChange(null)}>
            <span className="size-5 rounded-full border border-dashed" />
            <span className="flex-1 text-muted-foreground">Unassigned</span>
          </DropdownMenuItem>
          {active.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No workspace members yet.</div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-3 text-xs text-muted-foreground">No members match.</div>
          ) : (
            filtered.map((m) => (
              <DropdownMenuItem key={m.user_id} onSelect={() => onChange(m.user_id)}>
                <Avatar name={m.display_name} src={m.avatar_url} size="xs" />
                <span className="flex-1 truncate">{m.display_name}</span>
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
