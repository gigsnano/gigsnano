"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Add01Icon } from "@hugeicons/core-free-icons";

import { Avatar } from "@/components/ui/avatar";
import type { IMemberCandidate } from "@/lib/members/project-member-candidates";
import { cn } from "@/lib/utils";

/**
 * Project members are drawn from the workspace's member pool (GitHub-style: you
 * add existing collaborators, not arbitrary users). The pool is bounded, so we
 * filter it client-side by name/email — no global `/users/` directory, no email
 * invite (the backend rejects non-workspace emails for a project). See GIN-10.
 *
 * Members whose workspace invite is still out are listed and marked "Invited"
 * (GIN-528) — pickable, but the label is there so nobody expects them to show up
 * in the project today.
 */
export function WorkspaceMemberPicker({
  candidates,
  onAddUser,
  isPending,
}: {
  candidates: IMemberCandidate[];
  onAddUser: (userId: string) => void;
  isPending?: boolean;
}) {
  const [query, setQuery] = useState("");

  // React Compiler memoizes this — no manual useMemo (project rule).
  const q = query.trim().toLowerCase();
  const matches = q
    ? candidates.filter(
        (c) => c.display_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q),
      )
    : candidates;

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <HugeiconsIcon
          icon={Search01Icon}
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          aria-label="Search project members"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search members…"
          className="h-9 w-full rounded-md border bg-transparent pl-8 pr-3 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>

      <div className="max-h-64 overflow-y-auto">
        {matches.map((c) => (
          <button
            key={c.user_id}
            type="button"
            disabled={isPending}
            onClick={() => onAddUser(c.user_id)}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted",
              "disabled:pointer-events-none disabled:opacity-50",
            )}
          >
            <Avatar name={c.display_name} src={c.avatar_url} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium text-foreground">
                  {c.display_name}
                </span>
                {c.invited ? (
                  <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-300">
                    Invited
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.invited ? `${c.email} · joins when they accept` : c.email}
              </span>
            </span>
            <HugeiconsIcon icon={Add01Icon} className="size-4 text-muted-foreground" />
          </button>
        ))}

        {matches.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">
            {candidates.length === 0
              ? "Everyone in this workspace is already on the project. Invite people to the workspace first — you can add them here while their invite is still out."
              : "No matching members."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
