import { formatCostCents } from "@/lib/ai-cost/format";
import { formatCents } from "@/lib/format/money";
import { cn } from "@/lib/utils";

type CostPillVariant = "cost" | "estimate" | "balance";

/**
 * The single reusable money chip. Money-primary, sub-cent-aware, tabular-nums.
 * - "cost"     — a receipt for what an action consumed (muted).
 * - "estimate" — a pre-run range/typical (muted, prefixed ~ by caller).
 * - "balance"  — remaining wallet funds (dollar format; color-shifts when low).
 */
export function CostPill({
  cents,
  variant = "cost",
  size = "sm",
  tone = "normal",
  className,
}: {
  cents: number;
  variant?: CostPillVariant;
  size?: "sm" | "md";
  /** For "balance": drives the color. */
  tone?: "normal" | "low" | "empty";
  className?: string;
}) {
  const label = variant === "balance" ? formatCents(cents) : formatCostCents(cents);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium tabular-nums transition-colors duration-300 ease-out",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-xs",
        variant === "balance"
          ? tone === "empty"
            ? "bg-destructive/10 text-destructive"
            : tone === "low"
              ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
              : "bg-muted text-muted-foreground"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {label}
    </span>
  );
}
