"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon, Tick02Icon, Folder01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { useGitHubRepos, useGitHubInstallUrl, useGitHubStatus } from "@/hooks/auth/use-auth";

export function RepoPicker({
  workspaceSlug,
  value,
  onChange,
  onBeforeConnect,
}: {
  workspaceSlug: string;
  value: string | null;
  onChange: (repoFullName: string | null) => void;
  /** Called right before the OAuth redirect tears down the SPA, so the caller
   *  can persist any state it needs to resume the flow on return. */
  onBeforeConnect?: () => void;
}) {
  const status = useGitHubStatus(workspaceSlug);
  const connected = status.data?.connected ?? false;
  const repos = useGitHubRepos(workspaceSlug, connected);
  const installUrl = useGitHubInstallUrl();
  const [query, setQuery] = useState("");
  // The results list collapses once a repo is picked (GIN-37) — reopen via "Change".
  const [pickerOpen, setPickerOpen] = useState(false);

  const list = repos.data ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q ? list.filter((r) => r.full_name.toLowerCase().includes(q)) : list;

  if (!connected) {
    return (
      <div className="rounded-lg border bg-muted/30 p-3 text-sm">
        <p className="text-muted-foreground">Connect GitHub to pick a repository to document.</p>
        <button
          type="button"
          className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
          disabled={installUrl.isPending}
          onClick={async () => {
            try {
              const { url } = await installUrl.mutateAsync(workspaceSlug);
              // Snapshot the in-progress create-project form before the redirect
              // destroys it, so the callback can restore the dialog on return.
              onBeforeConnect?.();
              // Remember which workspace we're connecting so the OAuth callback
              // page (which has no workspace in its URL) can complete the flow,
              // and where to return the user afterwards (back into the dialog).
              sessionStorage.setItem("gh_oauth_ws", workspaceSlug);
              sessionStorage.setItem(
                "gh_oauth_return",
                `/${workspaceSlug}/projects?resumeCreate=existing`,
              );
              window.location.href = url;
            } catch {
              // install-url failed (e.g. OAuth not configured) — button re-enables.
            }
          }}
        >
          {installUrl.isPending ? "Opening…" : "Connect GitHub"}
        </button>
      </div>
    );
  }

  // Collapsed state: a repo is chosen and the list isn't being (re)opened.
  const collapsed = value != null && !pickerOpen;

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Repository</span>

      {collapsed ? (
        // Compact selected row — the list is out of the way until "Change" (GIN-37).
        <div className="flex h-9 items-center gap-2 rounded-md border bg-muted/30 px-2.5 text-sm">
          <HugeiconsIcon icon={Folder01Icon} className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 truncate font-medium">{value}</span>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setPickerOpen(true);
            }}
            className="shrink-0 text-xs font-medium text-primary hover:underline"
          >
            Change
          </button>
        </div>
      ) : (
        <>
          {/* Search field — filters the connected account's repos by name. */}
          <div className="flex h-9 items-center gap-2 rounded-md border bg-background px-2.5 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
            <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search repositories…"
              aria-label="Search repositories"
              autoFocus={pickerOpen}
              className="h-full flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          {/* Results — scrollable; picking a row selects it and collapses the list. */}
          <div className="max-h-44 overflow-y-auto rounded-md border">
            {repos.isPending ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">Loading repositories…</p>
            ) : repos.isError ? (
              <p className="px-3 py-2 text-sm text-destructive">Couldn&apos;t load repositories.</p>
            ) : filtered.length === 0 ? (
              <p className="px-3 py-2 text-sm text-muted-foreground">
                {query.trim() ? "No repositories match your search." : "No repositories found."}
              </p>
            ) : (
              filtered.map((r) => {
                const selected = r.full_name === value;
                return (
                  <button
                    key={r.full_name}
                    type="button"
                    onClick={() => {
                      const next = selected ? null : r.full_name;
                      onChange(next);
                      // Collapse the list on selection; keep it open if deselecting.
                      setPickerOpen(next == null);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors",
                      selected ? "bg-primary/10 text-foreground" : "hover:bg-accent/50",
                    )}
                  >
                    <span className="flex-1 truncate">{r.full_name}</span>
                    {selected ? (
                      <HugeiconsIcon icon={Tick02Icon} className="size-4 shrink-0 text-primary" />
                    ) : null}
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
