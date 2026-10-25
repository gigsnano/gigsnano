"use client";

import { useState } from "react";

import { useCreateExport, useExports } from "@/hooks/integrations/use-exports";
import { useOffsetPagination } from "@/hooks/ui/use-offset-pagination";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { OffsetPagination } from "@/components/ui/offset-pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { EExportStatus } from "@/types";
import type { IExportJob } from "@/types";

function isExpired(job: IExportJob): boolean {
  return job.expires_at !== null && new Date(job.expires_at) < new Date();
}

export function ExportsSettings({ workspaceSlug }: { workspaceSlug: string }) {
  const { setOffset, pageFilters } = useOffsetPagination(20);
  const { data: page, isPending, isError, refetch } = useExports(workspaceSlug, pageFilters);
  const create = useCreateExport(workspaceSlug);
  const [name, setName] = useState("");
  const [format, setFormat] = useState<"csv" | "json" | "xlsx">("csv");

  const onExport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    await create.mutateAsync({ name: name.trim(), format });
    setName("");
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
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-4 w-16" />
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
          title="Couldn't load exports"
          description="Something went wrong fetching export jobs."
          actions={[{ label: "Retry", onClick: () => refetch() }]}
        />
      </div>
    );
  }

  const jobs = page?.items ?? [];

  return (
    <div className="max-w-2xl px-10 py-8">
      <h1 className="text-lg font-semibold">Exports</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Download your workspace&apos;s work items as CSV, JSON, or Excel.
      </p>

      <form onSubmit={onExport} className="mt-6 flex gap-2">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label id="export-name-label" htmlFor="export-name" className="sr-only">
            Export name
          </Label>
          <input
            id="export-name"
            aria-labelledby="export-name-label"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Export name"
            className="flex-1 rounded-md border bg-background px-3 py-2 text-sm"
          />
        </div>
        <select
          aria-label="Export format"
          value={format}
          onChange={(e) => setFormat(e.target.value as "csv" | "json" | "xlsx")}
          className="rounded-md border bg-background px-3 py-2 text-sm"
        >
          <option value="csv">CSV</option>
          <option value="json">JSON</option>
          <option value="xlsx">Excel (XLSX)</option>
        </select>
        <Button type="submit" size="sm" disabled={create.isPending || !name.trim()}>
          Export
        </Button>
      </form>

      <section className="mt-6 rounded-lg border">
        {jobs.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">No exports yet.</p>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium">Name</th>
                  <th className="px-5 py-3 font-medium">Format</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th scope="col" className="px-5 py-3 font-medium">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="px-5 py-3 font-medium">{job.name}</td>
                    <td className="px-5 py-3 uppercase text-muted-foreground">{job.format}</td>
                    <td className="px-5 py-3 capitalize text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        {job.status === EExportStatus.Pending ? (
                          <span
                            aria-hidden="true"
                            className="size-3 animate-spin rounded-full border-2 border-muted border-t-foreground"
                          />
                        ) : null}
                        {job.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      {job.status === EExportStatus.Ready && job.download_url ? (
                        isExpired(job) ? (
                          <span className="text-xs text-muted-foreground">Expired</span>
                        ) : (
                          <a
                            href={job.download_url}
                            className="text-xs font-medium text-primary hover:underline"
                          >
                            Download
                          </a>
                        )
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
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
