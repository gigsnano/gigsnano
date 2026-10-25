import { HugeiconsIcon } from "@hugeicons/react";

import { ACCESS_LABEL, HEALTH_META, REPOSITORY_TYPE_LABEL } from "@/constants/codebase-meta";
import { cn } from "@/lib/utils";
import type { ERepoAccess, ERepoHealth, ERepositoryType } from "@/types";

/** Health = icon + text (never colour alone) — spec a11y requirement. */
export function RepoHealthBadge({ health }: { health: ERepoHealth }) {
  const meta = HEALTH_META[health];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", meta.tone)}>
      <HugeiconsIcon icon={meta.icon} className={cn("size-3.5", meta.spin && "animate-spin")} />
      {meta.label}
    </span>
  );
}

export function RepoTypeBadge({ type }: { type: ERepositoryType }) {
  return (
    <span className="inline-flex items-center rounded-md border bg-muted/40 px-1.5 py-0.5 text-xs text-muted-foreground">
      {REPOSITORY_TYPE_LABEL[type]}
    </span>
  );
}

export function RepoAccessBadge({ access }: { access: ERepoAccess }) {
  return (
    <span className="text-xs text-muted-foreground">{ACCESS_LABEL[access]}</span>
  );
}
