"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { useSlackChannels } from "@/hooks/slack/use-slack";

/** Mirrors repo-picker.tsx's search + select list, for choosing the default
 * Slack channel notifications post to. */
export function ChannelPicker({
  workspaceSlug,
  value,
  onChange,
}: {
  workspaceSlug: string;
  value: string | null;
  onChange: (channel: { id: string; name: string }) => void;
}) {
  const channels = useSlackChannels(workspaceSlug, true);
  const [query, setQuery] = useState("");

  const list = channels.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter((c) => c.name.toLowerCase().includes(q)) : list;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Default channel</span>

      <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search channels…"
          aria-label="Search channels"
          className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="max-h-44 overflow-y-auto rounded-md border">
        {channels.isPending ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">Loading channels…</p>
        ) : channels.isError ? (
          <p className="px-3 py-2 text-sm text-destructive">Couldn&apos;t load channels.</p>
        ) : filtered.length === 0 ? (
          <p className="px-3 py-2 text-sm text-muted-foreground">
            {query.trim() ? "No channels match your search." : "No channels found."}
          </p>
        ) : (
          filtered.map((c) => {
            const selected = c.id === value;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onChange(c)}
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                  selected ? "bg-primary/10 text-foreground" : "hover:bg-accent/50",
                )}
              >
                <span className="flex-1 truncate">#{c.name}</span>
                {selected ? (
                  <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-primary" />
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
