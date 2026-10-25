"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { WORK_ITEM_IO_COLUMNS, DEFAULT_EXPORT_KEYS } from "@/constants/work-item-io-columns";
import { useCreateWorkItemExport, useExportJob } from "@/hooks/work-item-io/use-work-item-io";
import { useCustomFields } from "@/hooks/project/use-project-settings";
import { workItemIoService } from "@/services/work-item-io/work-item-io.service";
import { triggerDownload } from "@/lib/download/trigger-download";
import { mergeCustomFieldColumns } from "@/lib/work-item-io/merge-custom-columns";
import { useIssuesViewStore } from "@/store/ui/issues-view.store";
import { EExportStatus } from "@/types";
import type { IWorkItemExportFilters } from "@/types";

type ExportScope = "all" | "view";
type ExportFormat = "xlsx" | "csv";

const TITLE_KEY = "title";

/** Snapshot the Work Items filter bar into the export-request shape (task-B5 brief). */
function currentViewFilters(): IWorkItemExportFilters {
  const f = useIssuesViewStore.getState().filters;
  return {
    status_in: f.status.length ? f.status : undefined,
    priority_in: f.priority.length ? f.priority : undefined,
    type_in: f.type.length ? f.type : undefined,
    assignee_ids: f.assignee.length ? f.assignee : undefined,
    label_ids: f.label.length ? f.label : undefined,
  };
}

/** Small segmented two/three-way toggle shared by the scope + format pickers. */
function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
  disabled,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border bg-muted/40 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={value === opt.value}
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium outline-none transition-colors disabled:pointer-events-none disabled:opacity-50",
            "focus-visible:ring-[3px] focus-visible:ring-ring/50",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Export-to-Excel/CSV dialog for the Work Items toolbar (GIN-75).
 * Submits a scope + column + format request, then either downloads
 * immediately (mock / synchronously-ready backend job) or polls the
 * dedicated project export-status endpoint (`useExportJob`) until the job
 * is ready. The shared workspace `useExports` list never refetches on its
 * own, so it can't be used to discover a just-created PENDING job.
 */
export function ExportDialog({
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
  const [scope, setScope] = useState<ExportScope>("all");
  const [format, setFormat] = useState<ExportFormat>("xlsx");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(DEFAULT_EXPORT_KEYS));
  // Custom-field columns are default-checked. Rather than seeding `selected`
  // once the async `useCustomFields` fetch resolves (which would need a
  // synchronizing effect), we track the opposite: which custom columns were
  // explicitly unchecked. A column that never appears here is checked.
  const [deselectedCustom, setDeselectedCustom] = useState<Set<string>>(() => new Set());
  const [pendingJobId, setPendingJobId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createExport = useCreateWorkItemExport(workspaceSlug, projectId);
  const jobPoll = useExportJob(workspaceSlug, projectId, pendingJobId);
  const customFields = useCustomFields(workspaceSlug, projectId);
  const customCols = (customFields.data ?? []).map((d) => ({ key: `cf:${d.id}`, label: d.name }));
  const allCols = mergeCustomFieldColumns(
    WORK_ITEM_IO_COLUMNS.map((c) => ({ key: c.key, label: c.label })),
    customFields.data ?? [],
  );

  // Reset the form each time the dialog transitions closed -> open. The pure
  // local-state adjustments are made during render via a prev-prop
  // comparison — mirrors the pattern in create-work-item-modal.tsx. Skipped
  // entirely while a job is still polling: the dialog stays mounted across
  // close/reopen, and an in-flight `pendingJobId` must survive a reopen so
  // the download still fires when the job becomes ready.
  //
  // `Boolean(open)` (rather than the bare `open` param) is intentional: it
  // isn't a runtime no-op workaround, it sidesteps a react-doctor v0.7.7
  // false positive in `no-impure-state-updater` where passing a destructured
  // component parameter directly as a setter's argument makes the rule's
  // resolver mistake the *whole component* for the "updater" being called.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(Boolean(open));
    if (open && pendingJobId === null) {
      setScope("all");
      setFormat("xlsx");
      setSelected(new Set(DEFAULT_EXPORT_KEYS));
      setDeselectedCustom(new Set());
      setError(null);
    }
  }

  // Triggering a file download is a DOM side effect, so it stays in an
  // effect. `handledRef` guards against acting twice for the same job while
  // the poll keeps refetching an already-terminal job. READY and FAILED get
  // their own effects (each a single guard-clause followed by its own
  // unconditional body) rather than one effect branching on status -- that
  // keeps each branch's state updates at the effect's top level instead of
  // nested inside an `if`, which is what lets React Compiler memoize it.
  const handledRef = useRef<string | null>(null);
  useEffect(() => {
    const job = jobPoll.data;
    if (!job || job.status !== EExportStatus.Ready || !job.download_url) return;
    if (handledRef.current === job.id) return;
    handledRef.current = job.id;
    triggerDownload(workItemIoService.downloadUrl(job.download_url), `work-items.${format}`);
    setPendingJobId(null);
    onOpenChange(false);
  }, [jobPoll.data, format, onOpenChange]);

  useEffect(() => {
    const job = jobPoll.data;
    if (!job || job.status !== EExportStatus.Failed) return;
    if (handledRef.current === job.id) return;
    handledRef.current = job.id;
    // Unfreeze the dialog: clearing pendingJobId lets the "Export" button
    // recover from "Preparing…" and lets the reopen-reset block above run
    // again on the next close/open cycle. Both setters are batched into the
    // single render this effect run already causes -- they're two
    // independent values driven by the same external signal (the job
    // settling into FAILED), not a derived chain, so there's no extra
    // render to eliminate here (verified false positive).
    setPendingJobId(null);
    // eslint-disable-next-line react-doctor/no-chain-state-updates -- see comment above
    setError("Export failed. Please try again.");
  }, [jobPoll.data]);

  const toggleColumn = (key: string) => {
    if (key === TITLE_KEY) return; // Title is always included.
    if (key.startsWith("cf:")) {
      setDeselectedCustom((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const isPolling = pendingJobId !== null;
  const isBusy = createExport.isPending || isPolling;
  const canExport = selected.size > 0 && !isBusy;

  const handleExport = async () => {
    if (!canExport) return;
    // Imperative reset (event-handler, not an effect keyed on the mutation
    // object) so a fresh attempt clears any prior error state.
    createExport.reset();
    setError(null);
    const columns = [
      ...WORK_ITEM_IO_COLUMNS.flatMap((c) => (selected.has(c.key) ? [c.key] : [])),
      ...customCols.flatMap((c) => (deselectedCustom.has(c.key) ? [] : [c.key])),
    ];
    const filters = scope === "view" ? currentViewFilters() : undefined;
    const job = await createExport.mutateAsync({ columns, format, scope, filters });
    if (job.status === EExportStatus.Ready && job.download_url) {
      triggerDownload(workItemIoService.downloadUrl(job.download_url), `work-items.${format}`);
      onOpenChange(false);
      return;
    }
    setPendingJobId(job.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export work items</DialogTitle>
          <DialogDescription>
            Download this project&apos;s work items as an Excel or CSV file.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Scope</span>
            <SegmentedToggle
              value={scope}
              onChange={setScope}
              disabled={isBusy}
              options={[
                { value: "all", label: "All items" },
                { value: "view", label: "Current view" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Format</span>
            <SegmentedToggle
              value={format}
              onChange={setFormat}
              disabled={isBusy}
              options={[
                { value: "xlsx", label: "Excel (.xlsx)" },
                { value: "csv", label: "CSV" },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Columns</span>
            <div
              className={cn(
                "grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border p-3 transition-opacity duration-200",
                isBusy && "opacity-60",
              )}
            >
              {allCols.map((col, idx) => {
                const checked = col.key.startsWith("cf:")
                  ? !deselectedCustom.has(col.key)
                  : col.key === TITLE_KEY || selected.has(col.key);
                const rowDisabled = col.key === TITLE_KEY || isBusy;
                return (
                  <div
                    key={col.key}
                    style={{ "--i": Math.floor(idx / 2) } as CSSProperties}
                    className={cn(
                      "t-home-rise -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-1 transition-colors duration-150",
                      !rowDisabled && "hover:bg-accent/40",
                    )}
                  >
                    <Checkbox
                      id={`export-col-${col.key}`}
                      checked={checked}
                      disabled={rowDisabled}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    <Label
                      htmlFor={`export-col-${col.key}`}
                      className={cn(
                        "flex-1 font-normal text-foreground",
                        !rowDisabled && "cursor-pointer",
                      )}
                    >
                      {col.label}
                    </Label>
                  </div>
                );
              })}
            </div>
          </div>

          {createExport.isError ? (
            <p
              key={createExport.submittedAt}
              className="t-error is-shaking text-sm text-destructive"
            >
              Couldn&apos;t start the export. Please try again.
            </p>
          ) : null}

          {error ? <p className="t-error is-shaking text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleExport} disabled={!canExport}>
            {isBusy ? (
              <>
                <span
                  aria-hidden="true"
                  className="size-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground"
                />
                {isPolling ? "Preparing…" : "Exporting…"}
              </>
            ) : (
              "Export"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
