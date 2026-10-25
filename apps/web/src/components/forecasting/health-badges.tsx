import {
  CONFIDENCE_META,
  HEALTH_STATUS_META,
  type THealthStatus,
} from "@/lib/forecasting/health-status";
import { cn } from "@/lib/utils";

/** Shared health-status presentation primitives (GIN-341) — the Project Health
 *  card and the Manager-360 roll-up render the same pills so status never looks
 *  different between surfaces. Colour is always paired with a label (text-first). */

type Tone = "positive" | "caution" | "critical" | "neutral";

const TONE_PILL: Record<Tone, string> = {
  positive: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  caution: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  critical: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-400",
  neutral: "border-border bg-muted text-muted-foreground",
};

const TONE_DOT: Record<Tone, string> = {
  positive: "bg-emerald-500",
  caution: "bg-amber-500",
  critical: "bg-red-500",
  neutral: "bg-muted-foreground/50",
};

export function StatusPill({ status, className }: { status: THealthStatus; className?: string }) {
  const meta = HEALTH_STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
        TONE_PILL[meta.tone],
        className,
      )}
      title={meta.meaning}
    >
      <span className={cn("size-1.5 rounded-full", TONE_DOT[meta.tone])} aria-hidden="true" />
      {meta.label}
    </span>
  );
}

export function ConfidenceBadge({ confidence }: { confidence: string }) {
  const meta = CONFIDENCE_META[confidence] ?? CONFIDENCE_META.no_data;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        TONE_PILL[meta.tone],
      )}
    >
      {meta.label}
    </span>
  );
}
