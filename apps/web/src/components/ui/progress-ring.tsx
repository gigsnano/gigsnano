import { cn } from "@/lib/utils";

interface ProgressRingProps {
  value: number; // 0..100
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabel?: boolean;
}

/** Circular progress indicator (tokenized). Used in cycle rows. */
export function ProgressRing({
  value,
  size = 28,
  strokeWidth = 3,
  className,
  showLabel = false,
}: ProgressRingProps) {
  const pct = Math.max(0, Math.min(100, value));
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - pct / 100);

  return (
    <span className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-muted" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-primary transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {showLabel ? (
        <span className="absolute text-[10px] font-semibold tabular-nums text-foreground">{pct}%</span>
      ) : null}
    </span>
  );
}
