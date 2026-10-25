import { cn } from "@/lib/utils";

import { WEIGHT_META } from "./customer-weight";

export function WeightChip({ weight, className }: { weight: number; className?: string }) {
  const meta = WEIGHT_META[weight] ?? WEIGHT_META[0];
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium",
        meta.chip,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
