"use client";

import { Alert02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { blockingCount, effectiveStatus, effectiveTitle, groupFindings } from "@/lib/package-import/intake";
import { cn } from "@/lib/utils";
import { EFindingStatus, type IPackageAnalysis, type IPackageFinding } from "@/types";

/** Status is carried by a word, never by colour alone. */
const STATUS_LABEL: Record<EFindingStatus, string> = {
  [EFindingStatus.Approved]: "Approved",
  [EFindingStatus.Proposed]: "Proposed",
  [EFindingStatus.Assumption]: "Assumption",
  [EFindingStatus.Blocked]: "Blocked",
  [EFindingStatus.Missing]: "Missing",
  [EFindingStatus.Conflict]: "Conflict",
};

const STATUS_TONE: Record<EFindingStatus, string> = {
  [EFindingStatus.Approved]: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  [EFindingStatus.Proposed]: "bg-muted text-muted-foreground",
  [EFindingStatus.Assumption]: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  [EFindingStatus.Blocked]: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
  [EFindingStatus.Missing]: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  [EFindingStatus.Conflict]: "bg-destructive/15 text-destructive",
};

export function FindingsStep({
  analysis,
  onResolve,
  isResolving,
}: {
  analysis: IPackageAnalysis;
  onResolve: (finding: IPackageFinding, status: EFindingStatus) => void;
  isResolving: boolean;
}) {
  const [selected, setSelected] = useState<IPackageFinding | null>(null);
  const groups = groupFindings(analysis.findings);
  const blocking = blockingCount(analysis.findings);

  if (analysis.findings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/30 px-5 py-10 text-center">
        <p className="text-sm font-medium text-foreground">Nothing was found in these documents</p>
        <p className="mt-1 text-sm text-muted-foreground">
          They may be reference material rather than a delivery plan. Try correcting a
          document&apos;s type and analysing again.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-base font-medium text-foreground">What the package says</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {analysis.findings.length} findings across {groups.length}{" "}
          {groups.length === 1 ? "category" : "categories"}. Select any one to see the exact text it
          came from.
        </p>
      </header>

      {blocking > 0 ? (
        <div className="flex items-start gap-2.5 rounded-md border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0 text-destructive" />
          <div>
            <p className="text-sm font-medium text-foreground">
              {blocking} {blocking === 1 ? "conflict blocks" : "conflicts block"} this import
            </p>
            <p className="text-sm text-muted-foreground">
              Two documents disagree. Choose which one is right — the import cannot create work from
              a contradiction it was told to keep.
            </p>
          </div>
        </div>
      ) : null}

      {groups.map((group) => (
        <section key={group.kind} className="flex flex-col gap-1.5">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {group.label}
            <span className="ml-1.5 font-normal normal-case">({group.findings.length})</span>
          </h3>
          <ul className="flex flex-col gap-1.5">
            {group.findings.map((finding) => {
              const status = effectiveStatus(finding);
              return (
                <li key={finding.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(finding)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-md border px-3 py-2.5 text-left",
                      "transition-[background-color,border-color] duration-150 ease-out",
                      "hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      "active:scale-[0.995]",
                      status === EFindingStatus.Conflict
                        ? "border-destructive/40"
                        : "border-border",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-foreground">
                        {effectiveTitle(finding)}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {finding.anchor}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {finding.override ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                          Your call
                        </span>
                      ) : null}
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-xs",
                          STATUS_TONE[status],
                        )}
                      >
                        {STATUS_LABEL[status]}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <Sheet open={Boolean(selected)} onOpenChange={(open) => !open && setSelected(null)}>
        <SheetContent className="flex w-full flex-col gap-4 sm:max-w-md">
          <div className="flex flex-col gap-1 border-b px-4 pb-4 pt-5">
            <SheetTitle>{selected ? effectiveTitle(selected) : ""}</SheetTitle>
            <SheetDescription>{selected?.anchor}</SheetDescription>
          </div>

          {selected ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
              {selected.detail ? (
                <p className="text-sm text-foreground">{selected.detail}</p>
              ) : null}

              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  From the document
                </h4>
                {/* The evidence, verbatim. The point of the drawer is that a
                    reader can check the claim against the source themselves. */}
                <pre className="mt-1.5 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-muted/60 p-3 text-xs text-foreground">
                  {selected.source_excerpt}
                </pre>
              </div>

              {selected.override ? (
                <p className="text-xs text-muted-foreground">
                  Originally read as <strong>{STATUS_LABEL[selected.status]}</strong>. Your decision
                  is recorded separately, so the original stays auditable.
                </p>
              ) : null}

              <div>
                <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Your decision
                </h4>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[EFindingStatus.Approved, EFindingStatus.Assumption, EFindingStatus.Blocked].map(
                    (status) => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={effectiveStatus(selected) === status ? "default" : "outline"}
                        disabled={isResolving}
                        onClick={() => onResolve(selected, status)}
                      >
                        {STATUS_LABEL[status]}
                      </Button>
                    ),
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
