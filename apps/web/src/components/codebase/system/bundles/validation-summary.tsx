import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import type { IBundleValidationResult } from "@/types";

/**
 * Inline validation result — green checklist when valid, grouped red issues when not.
 * Rendered live in the wizard's review step and mirrored at the top on save.
 */
export function ValidationSummary({ result }: { result: IBundleValidationResult }) {
  if (result.valid) {
    const checks = ["Unique mount paths", "No path traversal", "No dependency cycles"];
    return (
      <div className="space-y-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        {checks.map((c) => (
          <p key={c} className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-300">
            <HugeiconsIcon icon={CheckmarkCircle02Icon} className="size-4 shrink-0" />
            {c}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-sm font-medium text-destructive">
        {result.issues.length} issue{result.issues.length === 1 ? "" : "s"} to fix
      </p>
      {result.issues.map((issue) => (
        <p
          key={`${issue.code}:${issue.repo_ids.join("_")}:${issue.message}`}
          className="flex items-start gap-2 text-sm text-destructive/90"
        >
          <HugeiconsIcon icon={Alert02Icon} className="mt-0.5 size-4 shrink-0" />
          {issue.message}
        </p>
      ))}
    </div>
  );
}
