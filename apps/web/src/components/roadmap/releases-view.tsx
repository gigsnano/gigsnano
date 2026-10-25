"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Add01Icon, SparklesIcon, RocketIcon, Link01Icon } from "@hugeicons/core-free-icons";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useProjects } from "@/hooks/project/use-projects";
import { useProjectStories } from "@/hooks/story/use-stories";
import {
  useCreateRelease,
  useGenerateChangelog,
  useLinkRelease,
  useReleases,
  useUpdateRelease,
} from "@/hooks/roadmap/use-roadmap";
import { EStoryStatus, type IRelease } from "@/types";
import { cn } from "@/lib/utils";

function StatusPill({ status }: { status: string }) {
  const released = status === "released";
  return (
    <span
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-medium capitalize",
        released
          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
          : "border-border bg-muted text-muted-foreground",
      )}
    >
      {status}
    </span>
  );
}

function ReleaseDetail({
  workspaceSlug,
  projectId,
  release,
}: {
  workspaceSlug: string;
  projectId: string;
  release: IRelease;
}) {
  const { data: stories } = useProjectStories(workspaceSlug, projectId);
  const update = useUpdateRelease(workspaceSlug, projectId);
  const link = useLinkRelease(workspaceSlug, projectId);
  const generate = useGenerateChangelog(workspaceSlug, projectId);
  const [editing, setEditing] = useState<string | null>(null);

  const linked = (stories ?? []).filter((s) => s.release_id === release.id);
  const doneUnlinked = (stories ?? []).filter(
    (s) => s.status === EStoryStatus.Done && s.release_id !== release.id,
  );
  const published = release.status === "released";

  return (
    <div className="rounded-2xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">{release.version}</h2>
          {release.name ? <span className="text-muted-foreground">· {release.name}</span> : null}
          <StatusPill status={release.status} />
        </div>
        {!published ? (
          <Button
            size="sm"
            disabled={update.isPending}
            onClick={() =>
              update.mutate({ releaseId: release.id, payload: { status: "released" } })
            }
          >
            <HugeiconsIcon icon={RocketIcon} className="size-4" />
            Publish
          </Button>
        ) : null}
      </div>

      {/* Scope */}
      <section className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">
            Scope · {linked.length} linked item{linked.length === 1 ? "" : "s"}
          </p>
          {!published ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" disabled={doneUnlinked.length === 0}>
                  <HugeiconsIcon icon={Link01Icon} className="size-3.5" />
                  Link items
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
                {doneUnlinked.map((s) => (
                  <DropdownMenuItem
                    key={s.id}
                    onClick={() => link.mutate({ releaseId: release.id, storyIds: [s.id] })}
                  >
                    {s.code ? `${s.code} · ` : ""}
                    {s.title}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {linked.length ? (
          <div className="flex flex-wrap gap-1.5">
            {linked.map((s) => (
              <span key={s.id} className="rounded-md border bg-muted/40 px-2 py-0.5 text-xs">
                {s.code ?? s.title}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No shipped items linked yet. Link done work to build the changelog.
          </p>
        )}
      </section>

      {/* Changelog */}
      <section className="mt-4 border-t pt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="text-xs font-medium text-muted-foreground">Changelog</p>
          {!published ? (
            <div className="flex gap-1.5">
              <Button
                variant="ghost"
                size="sm"
                disabled={generate.isPending}
                onClick={() =>
                  generate.mutate(release.id, {
                    onSuccess: () => setEditing(null),
                  })
                }
              >
                <HugeiconsIcon icon={SparklesIcon} className="size-3.5" />
                {generate.isPending ? "Generating…" : release.changelog_md ? "Regenerate" : "Generate"}
              </Button>
              {release.changelog_md ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setEditing(editing === null ? release.changelog_md : null)}
                >
                  {editing === null ? "Edit" : "Done"}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>

        {generate.isError ? (
          <p className="mb-2 text-sm text-destructive">
            Link at least one shipped item before generating.
          </p>
        ) : null}

        {editing !== null ? (
          <div>
            <textarea
              value={editing}
              onChange={(e) => setEditing(e.target.value)}
              rows={8}
              aria-label="Changelog markdown"
              className="w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            />
            <div className="mt-2 flex justify-end">
              <Button
                size="sm"
                disabled={update.isPending}
                onClick={() =>
                  update.mutate(
                    { releaseId: release.id, payload: { changelog_md: editing } },
                    { onSuccess: () => setEditing(null) },
                  )
                }
              >
                Save changelog
              </Button>
            </div>
          </div>
        ) : release.changelog_md ? (
          <div className="gn-prose whitespace-pre-wrap text-sm text-foreground">
            {release.changelog_md}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No changelog yet — link shipped items and generate one.
          </p>
        )}
      </section>
    </div>
  );
}

export function ReleasesView({ workspaceSlug }: { workspaceSlug: string }) {
  const { data: projects } = useProjects(workspaceSlug);
  const [projectId, setProjectId] = useState<string | null>(null);
  const activeProject = projectId ?? projects?.[0]?.id ?? null;

  const { data, isPending, isError, refetch } = useReleases(workspaceSlug, activeProject ?? "");
  const create = useCreateRelease(workspaceSlug, activeProject ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [version, setVersion] = useState("");

  const releases = data ?? [];
  const selected = releases.find((r) => r.id === selectedId) ?? releases[0];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Project</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                {projects?.find((p) => p.id === activeProject)?.name ?? "Select"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
              {(projects ?? []).map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onClick={() => {
                    setProjectId(p.id);
                    setSelectedId(null);
                  }}
                >
                  {p.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-1.5">
          <Input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="v2.2"
            aria-label="New release version"
            className="h-8 w-28"
          />
          <Button
            size="sm"
            disabled={!version.trim() || !activeProject || create.isPending}
            onClick={() =>
              create.mutate(
                { version: version.trim() },
                {
                  onSuccess: (r) => {
                    setVersion("");
                    setSelectedId(r.id);
                  },
                },
              )
            }
          >
            <HugeiconsIcon icon={Add01Icon} className="size-4" />
            New release
          </Button>
        </div>
      </div>

      {isPending ? (
        <Skeleton className="h-48 rounded-2xl" />
      ) : isError ? (
        <EmptyState
          assetKey="error"
          align="start"
          title="Couldn't load releases"
          description="Something went wrong fetching releases for this project."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      ) : releases.length === 0 ? (
        <EmptyState
          assetKey="generic"
          title="No releases yet"
          description="Group shipped work into a versioned release, auto-draft its changelog, and publish."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-[200px_1fr]">
          <ul className="flex flex-col gap-1">
            {releases.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                    selected?.id === r.id ? "border-primary/40 bg-accent/40" : "hover:bg-accent/30",
                  )}
                >
                  <span className="font-medium">{r.version}</span>
                  <StatusPill status={r.status} />
                </button>
              </li>
            ))}
          </ul>
          {selected && activeProject ? (
            <ReleaseDetail
              workspaceSlug={workspaceSlug}
              projectId={activeProject}
              release={selected}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
