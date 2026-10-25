"use client";

import { blockingCount, groupViolationsByFile } from "@/lib/foundation/violations";
import { cn } from "@/lib/utils";
import type { IValidationResult } from "@/types/project/foundation";

export function ValidationResultPanel({ result }: { result: IValidationResult }) {
  if (result.status === "pass") {
    return (
      <div
        role="status"
        className="flex items-center gap-2 rounded-md border border-border bg-card px-4 py-3 text-sm text-foreground motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300 motion-safe:ease-out"
      >
        <span aria-hidden className="text-base leading-none text-primary">
          ✓
        </span>
        Compliant with the Foundation.
      </div>
    );
  }

  const groups = groupViolationsByFile(result.violations);
  const blocking = blockingCount(result);

  return (
    <div
      role="status"
      className="overflow-hidden rounded-md border border-border bg-card motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 motion-safe:ease-out"
    >
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-foreground">
          Foundation check: {result.violations.length} violation
          {result.violations.length === 1 ? "" : "s"}
        </span>
        {blocking > 0 && (
          <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
            {blocking} blocking — cannot accept
          </span>
        )}
      </div>
      <ul className="divide-y divide-border">
        {groups.map((group, gi) => (
          <li
            key={group.file || "__repo__"}
            className="px-4 py-2 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-300 motion-safe:ease-out"
            style={{ animationDelay: `${gi * 40}ms`, animationFillMode: "backwards" }}
          >
            <p className="text-xs font-medium text-muted-foreground">{group.file || "Repo-level"}</p>
            <ul className="mt-1 space-y-1">
              {group.items.map((v) => (
                <li key={`${v.rule}-${v.line}-${v.detail}`} className="text-sm text-foreground">
                  <span
                    aria-hidden
                    className={cn("mr-1.5", v.blocking ? "text-destructive" : "text-muted-foreground")}
                  >
                    ×
                  </span>
                  <span className={v.blocking ? "text-destructive" : "text-muted-foreground"}>
                    {v.rule}
                  </span>
                  {group.file ? `:${v.line}` : ""} — {v.detail}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
