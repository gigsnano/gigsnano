"use client";

import { useRef, useState } from "react";

import { useCreateImport, useImports } from "@/hooks/integrations/use-imports";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { importErrorMessage } from "@/lib/imports/error-message";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EImportStatus } from "@/types";
import type { IImportJob } from "@/types";

import { GitHubImportWizard } from "./imports/github-import-wizard";

const STATUS_LABEL: Record<EImportStatus, string> = {
  [EImportStatus.Queued]: "Queued",
  [EImportStatus.Parsing]: "Parsing",
  [EImportStatus.Importing]: "Importing",
  [EImportStatus.Completed]: "Completed",
  [EImportStatus.CompletedWithErrors]: "Completed with errors",
  [EImportStatus.Failed]: "Failed",
};

const PENDING = new Set([EImportStatus.Queued, EImportStatus.Parsing, EImportStatus.Importing]);

function inferFormat(fileName: string): "csv" | "json" | "xlsx" | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "csv" || ext === "zip") return "csv";
  if (ext === "json") return "json";
  if (ext === "xlsx") return "xlsx";
  return null;
}

function JobRow({ job }: { job: IImportJob }) {
  const [expanded, setExpanded] = useState(false);
  const summary = job.summary;
  const hasIssues = Boolean(
    summary?.errors?.length || summary?.unmatched_members?.length || summary?.notes?.length,
  );
  const summaryLine =
    job.source_format === "github"
      ? `${summary?.issues_created ?? 0} created · ${summary?.issues_skipped ?? 0} skipped`
      : `${summary?.projects_created ?? 0} projects · ${summary?.stories_created ?? 0} created · ${summary?.stories_updated ?? 0} updated`;

  return (
    <>
      <tr>
        <td className="px-5 py-3 font-medium uppercase text-muted-foreground">
          {job.source_format}
        </td>
        <td className="px-5 py-3">
          <span className="inline-flex items-center gap-1.5">
            {PENDING.has(job.status) ? (
              <span
                aria-hidden
                className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
              />
            ) : null}
            {STATUS_LABEL[job.status]}
          </span>
        </td>
        <td className="px-5 py-3 text-muted-foreground">{summary ? summaryLine : "—"}</td>
        <td className="px-5 py-3 text-right">
          {hasIssues ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs font-medium text-primary hover:underline"
            >
              {expanded ? "Hide" : "View"} issues
            </button>
          ) : (
            <span className="text-xs text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={4} className="bg-muted/30 px-5 py-3 text-xs">
            {summary?.unmatched_members?.length ? (
              <p className="mb-2">
                <span className="font-medium text-foreground">Unmatched members:</span>{" "}
                {summary.unmatched_members.join(", ")}
              </p>
            ) : null}
            {summary?.unassigned_logins?.length ? (
              <p className="mb-2">
                <span className="font-medium text-foreground">Unassigned (no GitHub login match):</span>{" "}
                {summary.unassigned_logins.join(", ")}
              </p>
            ) : null}
            {summary?.notes?.length ? (
              <ul className="mb-2 list-inside list-disc space-y-1 text-muted-foreground">
                {summary.notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            ) : null}
            {summary?.errors?.length ? (
              <ul className="list-inside list-disc space-y-1">
                {summary.errors.map((err) => (
                  <li key={`${err.row}-${err.reason}`}>
                    Row {err.row}: {err.reason}
                  </li>
                ))}
              </ul>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

export function ImportSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const { setOffset, pageFilters } = useOffsetPagination(20);
  const { data: page, isPending, isError, refetch } = useImports(workspaceSlug, pageFilters);
  const create = useCreateImport(workspaceSlug);
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const format = file ? inferFormat(file.name) : null;

  const onImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !format) return;
    try {
      await create.mutateAsync({ file, format });
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch {
      // swallow — create.isError/create.error drive the UI below
    }
  };

  if (isPending) {
    return (
      <div className="max-w-2xl px-10 py-8">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="mt-2 h-4 w-80" />
        <div className="mt-6 flex gap-2">
          <Skeleton className="h-9 flex-1" />
          <Skeleton className="h-9 w-28" />
        </div>
        <section className="mt-6 rounded-lg border">
          <div className="border-b px-5 py-3">
            <Skeleton className="h-3 w-24" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-5 py-3">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-48" />
            </div>
          ))}
        </section>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <EmptyState
          assetKey="error"
          title="Couldn't load imports"
          description="Something went wrong fetching import jobs."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const jobs = page?.items ?? [];

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Imports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Upload a Plane Settings → Exports file (CSV, JSON, XLSX, or a ZIP of several) to bring
        projects, work items, cycles, modules, labels, and states into this workspace. Re-uploading
        the same file updates existing records instead of duplicating them.
      </p>

      <form onSubmit={onImport} className="mt-6 flex flex-col gap-2">
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            aria-label="Choose a Plane export file"
            accept=".csv,.json,.xlsx,.zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs"
          />
          <Button type="submit" size="sm" disabled={create.isPending || !file || !format}>
            {create.isPending ? "Importing…" : "Import"}
          </Button>
        </div>
        {file && !format ? (
          <p className="text-xs text-destructive">
            Unrecognized file type — use .csv, .json, .xlsx, or .zip.
          </p>
        ) : null}
        {create.isError ? (
          <p className="text-xs text-destructive">{importErrorMessage(create.error)}</p>
        ) : null}
      </form>

      <div className="mt-6">
        <GitHubImportWizard workspaceSlug={workspaceSlug} />
      </div>

      <section className="mt-6 rounded-lg border">
        {jobs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No imports yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Summary</th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <JobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
            {(page?.total ?? 0) > (page?.limit ?? 20) ? (
              <div className="border-t px-5 py-3">
                <OffsetPagination
                  offset={page?.offset ?? 0}
                  limit={page?.limit ?? 20}
                  total={page?.total ?? 0}
                  onOffsetChange={setOffset}
                />
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
