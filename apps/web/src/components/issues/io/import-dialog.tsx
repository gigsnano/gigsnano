"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, Upload01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  useValidateWorkItemImport,
  useCreateWorkItemImport,
  useImportJob,
  invalidateProjectStories,
} from "@/hooks/work-item-io/use-work-item-io";
import { workItemIoService } from "@/services/work-item-io/work-item-io.service";
import { triggerDownload } from "@/lib/download/trigger-download";
import { EImportStatus } from "@/types";

type WizardStep = "pick" | "preview" | "running";
type ImportFormat = "xlsx" | "csv";

const PENDING_STATUSES = new Set([
  EImportStatus.Queued,
  EImportStatus.Parsing,
  EImportStatus.Importing,
]);

const RUNNING_LABEL: Record<string, string> = {
  [EImportStatus.Queued]: "Queued…",
  [EImportStatus.Parsing]: "Parsing file…",
  [EImportStatus.Importing]: "Importing…",
};

function inferFormat(fileName: string): ImportFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase();
  if (ext === "csv") return "csv";
  if (ext === "xlsx") return "xlsx";
  return null;
}

/** Small tokenized create/update pill — text-carrying, never color-only. */
function ActionBadge({ action }: { action: "create" | "update" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        action === "create" ? "bg-primary/10 text-primary" : "bg-muted text-foreground",
      )}
    >
      {action === "create" ? "Create" : "Update"}
    </span>
  );
}

/**
 * Import-from-Excel/CSV dialog for the Work Items toolbar (GIN-75).
 * Three-step wizard: pick a file (with a template download) -> server-side
 * dry-run preview (counts + sample rows + errors/warnings) -> confirm, which
 * creates the real import job and polls it (`useImportJob`) to a terminal
 * summary. Mirrors the reset-on-reopen + effect-side-effect patterns used by
 * `export-dialog.tsx` (task B5).
 */
export function ImportDialog({
  workspaceSlug,
  projectId,
  open,
  onOpenChange,
}: {
  workspaceSlug: string;
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [step, setStep] = useState<WizardStep>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState<ImportFormat | null>(null);
  const [formatError, setFormatError] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  // Bumped (never read/written on a ref) whenever the raw file input needs a
  // fresh, empty value — remounting via `key` is the react-doctor-safe way to
  // reset an uncontrolled <input type="file"> outside of an effect.
  const [resetNonce, setResetNonce] = useState(0);

  const validateImport = useValidateWorkItemImport(workspaceSlug, projectId);
  const createImport = useCreateWorkItemImport(workspaceSlug, projectId);
  const jobPoll = useImportJob(workspaceSlug, projectId, jobId);
  const queryClient = useQueryClient();

  // Reset the wizard each time the dialog transitions closed -> open. The
  // pure local-state adjustments are made during render via a prev-prop
  // comparison (not an effect) — same pattern as export-dialog.tsx. Skipped
  // while a job is still running so an in-flight import survives a reopen.
  //
  // `Boolean(open)` (rather than the bare `open` param) is intentional: it
  // isn't a runtime no-op workaround, it sidesteps a react-doctor v0.7.7
  // false positive in `no-impure-state-updater` where passing a destructured
  // component parameter directly as a setter's argument makes the rule's
  // resolver mistake the *whole component* for the "updater" being called.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(Boolean(open));
    if (open && jobId === null) {
      setStep("pick");
      setFile(null);
      setFormat(null);
      setFormatError(false);
      setResetNonce((n) => n + 1);
    }
  }

  const preview = validateImport.data;
  const job = jobPoll.data;
  const isRunning = job ? PENDING_STATUSES.has(job.status) : true;

  // The board must refresh only once the import job has actually finished —
  // `POST /import/` resolves with the QUEUED job before the backend
  // BackgroundTask creates any stories, so invalidating there (as
  // `useCreateStory` does on success) would refetch pre-import data. Instead,
  // invalidate here when the polled job reaches a terminal "stories were
  // written" state. `invalidatedJobRef` guards this to fire exactly once per
  // job id — read/written only inside the effect, never during render.
  const invalidatedJobRef = useRef<string | null>(null);
  useEffect(() => {
    const polledJob = jobPoll.data;
    if (!polledJob) return;
    const isTerminalSuccess =
      polledJob.status === EImportStatus.Completed ||
      polledJob.status === EImportStatus.CompletedWithErrors;
    if (!isTerminalSuccess) return;
    if (invalidatedJobRef.current === polledJob.id) return;
    invalidatedJobRef.current = polledJob.id;
    invalidateProjectStories(queryClient, workspaceSlug, projectId);
  }, [jobPoll.data, queryClient, workspaceSlug, projectId]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    if (!chosen) return;
    // Imperative reset (event-handler, not an effect keyed on the mutation
    // object) so a fresh attempt clears any prior error state.
    validateImport.reset();
    const fmt = inferFormat(chosen.name);
    if (!fmt) {
      setFormatError(true);
      setFile(null);
      setFormat(null);
      // Bump the nonce so a second consecutive bad pick (which wouldn't
      // otherwise remount the error message, since `formatError` stays
      // `true`) still re-triggers the shake, and so the input can accept a
      // re-selection of the same rejected file.
      setResetNonce((n) => n + 1);
      return;
    }
    setFormatError(false);
    setFile(chosen);
    setFormat(fmt);
    try {
      await validateImport.mutateAsync({ file: chosen, format: fmt });
      setStep("preview");
    } catch {
      // validateImport.isError drives the inline error below; bump the reset
      // nonce so the (uncontrolled) file input remounts empty and the user
      // can re-select the same file to retry.
      setResetNonce((n) => n + 1);
    }
  };

  const handleBack = () => {
    setStep("pick");
    setFile(null);
    setFormat(null);
    validateImport.reset();
    setResetNonce((n) => n + 1);
  };

  const handleConfirm = async () => {
    if (!file || !format) return;
    // Imperative reset (event-handler, not an effect keyed on the mutation
    // object) so a fresh attempt clears any prior error state.
    createImport.reset();
    try {
      const createdJob = await createImport.mutateAsync({ file, format });
      setJobId(createdJob.id);
      setStep("running");
    } catch {
      // createImport.isError drives the inline error below
    }
  };

  const handleDone = () => {
    setJobId(null);
    onOpenChange(false);
  };

  const toCreate = preview?.to_create ?? 0;
  const toUpdate = preview?.to_update ?? 0;
  const totalChanges = toCreate + toUpdate;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import work items</DialogTitle>
          <DialogDescription>
            {step === "pick" && "Upload an Excel or CSV file to create or update work items."}
            {step === "preview" && "Review the changes before importing."}
            {step === "running" && "Importing your work items."}
          </DialogDescription>
        </DialogHeader>

        {step === "pick" ? (
          <div className="t-view-swap flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Need the right columns?</span>
                <span className="text-xs text-muted-foreground">
                  Download the template and fill it in before uploading.
                </span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  triggerDownload(
                    workItemIoService.templateUrl(workspaceSlug, projectId),
                    "work-items-template.xlsx",
                  )
                }
              >
                Download template
              </Button>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="import-file-input" className="text-sm font-medium">
                File
              </label>
              <input
                key={resetNonce}
                id="import-file-input"
                type="file"
                accept=".xlsx,.csv"
                disabled={validateImport.isPending}
                onChange={handleFileChange}
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm outline-none file:mr-3 file:rounded file:border-0 file:bg-muted file:px-2 file:py-1 file:text-xs focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50"
              />
              {validateImport.isPending ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    className="size-3 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
                  />
                  Validating file…
                </span>
              ) : null}
              {formatError ? (
                <p key={resetNonce} className="t-error is-shaking text-xs text-destructive">
                  Unrecognized file type — use .xlsx or .csv.
                </p>
              ) : null}
              {validateImport.isError ? (
                <p key={resetNonce} className="t-error is-shaking text-xs text-destructive">
                  Couldn&apos;t validate this file. Check the format and try again.
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <div className="t-view-swap flex flex-col gap-4">
            <div className="flex items-center gap-4 rounded-lg border p-3 text-sm">
              <span>
                <span className="font-semibold text-foreground">{toCreate}</span>{" "}
                <span className="text-muted-foreground">to create</span>
              </span>
              <span>
                <span className="font-semibold text-foreground">{toUpdate}</span>{" "}
                <span className="text-muted-foreground">to update</span>
              </span>
              <span className="ml-auto text-muted-foreground">
                {preview.rows_total} row{preview.rows_total === 1 ? "" : "s"} total
              </span>
            </div>

            {preview.sample.length > 0 ? (
              <div className="max-h-64 overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card">
                    <tr className="border-b text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Row</th>
                      <th className="px-3 py-2 font-medium">Action</th>
                      <th className="px-3 py-2 font-medium">Title</th>
                      <th className="px-3 py-2 font-medium">Type</th>
                      <th className="px-3 py-2 font-medium">Parent</th>
                      <th className="px-3 py-2 font-medium">Assignee</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.sample.map((row) => (
                      <tr key={row.row} className="transition-colors duration-150 hover:bg-accent/40">
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">{row.row}</td>
                        <td className="px-3 py-2">
                          <ActionBadge action={row.action} />
                        </td>
                        <td className="max-w-40 truncate px-3 py-2" title={row.title}>
                          {row.title}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{row.type}</td>
                        <td className="max-w-28 truncate px-3 py-2 text-muted-foreground" title={row.parent ?? undefined}>
                          {row.parent ?? "—"}
                        </td>
                        <td className="max-w-28 truncate px-3 py-2 text-muted-foreground" title={row.assignee ?? undefined}>
                          {row.assignee ?? "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                No rows found in this file.
              </p>
            )}

            {preview.errors.length > 0 ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="mb-1.5 text-xs font-medium text-destructive">
                  {preview.errors.length} row{preview.errors.length === 1 ? "" : "s"} with errors
                </p>
                <ul className="list-inside list-disc space-y-1 text-xs text-destructive">
                  {preview.errors.map((err) => (
                    <li key={`${err.row}-${err.reason}`}>
                      Row {err.row}: {err.reason}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {preview.unmatched_assignees.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Unmatched assignees:</span>{" "}
                {preview.unmatched_assignees.join(", ")}
              </p>
            ) : null}

            {preview.unknown_labels.length > 0 ? (
              <p className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Unknown labels:</span>{" "}
                {preview.unknown_labels.join(", ")}
              </p>
            ) : null}

            {createImport.isError ? (
              <p
                key={createImport.submittedAt}
                className="t-error is-shaking text-sm text-destructive"
              >
                Couldn&apos;t start the import. Please try again.
              </p>
            ) : null}
          </div>
        ) : null}

        {step === "running" ? (
          <div className="t-view-swap flex flex-col gap-4">
            {isRunning ? (
              <div className="t-view-swap flex flex-col items-center gap-3 py-8 text-center">
                <span
                  aria-hidden="true"
                  className="size-8 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-primary"
                />
                <p className="text-sm text-muted-foreground">
                  {job ? (RUNNING_LABEL[job.status] ?? "Importing…") : "Starting import…"}
                </p>
              </div>
            ) : job?.status === EImportStatus.Failed ? (
              <div className="t-view-swap">
                <EmptyState
                  assetKey="error"
                  title="Import failed"
                  description="Something went wrong while importing your file. Please try again."
                />
              </div>
            ) : job ? (
              <div className="t-view-swap flex flex-col gap-4">
                <div className="flex flex-col items-center gap-2 py-4 text-center">
                  {job.status === EImportStatus.CompletedWithErrors ? (
                    <HugeiconsIcon
                      icon={Alert02Icon}
                      className="size-10 text-amber-600 motion-safe:animate-in motion-safe:zoom-in-50 motion-safe:duration-300 dark:text-amber-400"
                    />
                  ) : (
                    <span
                      className="t-success-check text-emerald-600 dark:text-emerald-400"
                      data-state="in"
                      aria-hidden="true"
                    >
                      <svg viewBox="0 0 48 48" width="40" height="40" fill="none">
                        <path
                          d="M14 25 L21 32 L34 17"
                          stroke="currentColor"
                          strokeWidth="3.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                  )}
                  <p className="text-sm font-medium text-foreground">
                    {job.status === EImportStatus.CompletedWithErrors
                      ? "Import completed with errors"
                      : "Import complete"}
                  </p>
                </div>

                <div className="flex items-center gap-4 rounded-lg border p-3 text-sm">
                  <span>
                    <span className="font-semibold text-foreground">
                      {job.summary?.created ?? 0}
                    </span>{" "}
                    <span className="text-muted-foreground">created</span>
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">
                      {job.summary?.updated ?? 0}
                    </span>{" "}
                    <span className="text-muted-foreground">updated</span>
                  </span>
                  <span>
                    <span className="font-semibold text-foreground">
                      {job.summary?.skipped ?? 0}
                    </span>{" "}
                    <span className="text-muted-foreground">skipped</span>
                  </span>
                </div>

                {job.summary?.errors?.length ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                    <p className="mb-1.5 text-xs font-medium text-destructive">
                      {job.summary.errors.length} row{job.summary.errors.length === 1 ? "" : "s"} with
                      errors
                    </p>
                    <ul className="list-inside list-disc space-y-1 text-xs text-destructive">
                      {job.summary.errors.map((err) => (
                        <li key={`${err.row}-${err.reason}`}>
                          Row {err.row}: {err.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          {step === "pick" ? (
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          ) : null}

          {step === "preview" ? (
            <>
              <Button variant="outline" size="sm" onClick={handleBack}>
                Back
              </Button>
              <Button size="sm" onClick={handleConfirm} disabled={totalChanges === 0 || createImport.isPending}>
                {createImport.isPending ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                    />
                    Importing…
                  </>
                ) : (
                  <>
                    <HugeiconsIcon icon={Upload01Icon} className="size-4" />
                    Import {totalChanges} item{totalChanges === 1 ? "" : "s"}
                  </>
                )}
              </Button>
            </>
          ) : null}

          {step === "running" && !isRunning ? (
            <Button size="sm" onClick={handleDone}>
              {job?.status === EImportStatus.Failed ? "Close" : "Done"}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
