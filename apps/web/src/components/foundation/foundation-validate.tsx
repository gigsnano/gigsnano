"use client";

import { useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShieldKeyIcon } from "@hugeicons/core-free-icons";

import { ValidationResultPanel } from "@/components/foundation/validation-result-panel";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useValidateDiff } from "@/hooks/project/use-foundation";
import type { IFoundation } from "@/types/project/foundation";

/** "Test a change against the Foundation" — paste a diff, pick gate outcomes,
 * see the same pass/violations verdict a real agent run or gig deliverable gets. */
export function FoundationValidate({
  workspaceSlug,
  projectId,
  foundation,
}: {
  workspaceSlug: string;
  projectId: string;
  foundation: IFoundation;
}) {
  const validate = useValidateDiff(workspaceSlug, projectId);
  const [diff, setDiff] = useState("");
  // Overrides map: a gate absent here defaults to passed. No async init from `foundation`.
  const [gateOverrides, setGateOverrides] = useState<Record<string, boolean>>({});
  const gates = foundation.quality_gates;
  const gateResults = Object.fromEntries(gates.map((g) => [g, gateOverrides[g] ?? true]));

  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 [&::-webkit-details-marker]:hidden">
        <HugeiconsIcon icon={ShieldKeyIcon} className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">Test a change against the Foundation</span>
        <span className="ml-auto text-muted-foreground transition-transform duration-200 group-open:rotate-90">
          ›
        </span>
      </summary>
      <div className="space-y-3 border-t border-border p-4">
        <p className="text-xs text-muted-foreground">
          Paste a unified diff to preview the exact pass/violations verdict enforced on agent runs
          and gig deliverables before merge.
        </p>
        <textarea
          value={diff}
          onChange={(e) => setDiff(e.target.value)}
          placeholder="Paste a unified diff…"
          aria-label="Unified diff to validate"
          className="h-40 w-full rounded-md border border-border bg-background p-3 font-mono text-xs text-foreground transition-colors duration-150 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        {gates.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium text-muted-foreground">Quality gates</legend>
            {gates.map((gate) => {
              const passed = gateOverrides[gate] ?? true;
              return (
                <label key={gate} className="flex items-center gap-2 text-sm text-foreground">
                  <Checkbox
                    checked={passed}
                    onCheckedChange={(v) =>
                      setGateOverrides((prev) => ({ ...prev, [gate]: v === true }))
                    }
                  />
                  <span className="font-mono text-xs">{gate}</span>
                  <span className="text-xs text-muted-foreground">
                    {passed ? "passed" : "failed"}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}
        <Button
          size="sm"
          disabled={!diff.trim() || validate.isPending}
          onClick={() => validate.mutate({ diff, gate_results: gateResults })}
          className="transition-transform duration-100 active:scale-[0.98]"
        >
          {validate.isPending ? "Checking…" : "Validate"}
        </Button>
        {validate.data && <ValidationResultPanel result={validate.data} />}
      </div>
    </details>
  );
}
