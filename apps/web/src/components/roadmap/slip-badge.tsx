import { HugeiconsIcon } from "@hugeicons/react";
import { Alert02Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";

import { SLIP_META } from "@/lib/roadmap/slip";
import { cn } from "@/lib/utils";
import type { TSlipSignal } from "@/types";

export function SlipBadge({ signal, reason }: { signal: TSlipSignal; reason?: string }) {
  const meta = SLIP_META[signal];
  return (
    <span
      title={reason}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.chip,
      )}
    >
      <HugeiconsIcon
        icon={signal === "on_track" ? CheckmarkCircle02Icon : Alert02Icon}
        className="size-3"
      />
      {meta.label}
    </span>
  );
}
