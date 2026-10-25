/** Pure presentation helpers for the Codebase Overview dashboard (GIN-271).
 * No JSX — colour/label maps and formatting shared by the dashboard cards. */
import type { CodebaseViewId } from "@/types/code/intelligence";
import type { HealthStatus, RiskSeverity, SectionState } from "@/types/code/overview";

/** Section state → short human label + a token-based tone class. Colour is never
 * the only signal (a11y): the label carries the same meaning. */
export const SECTION_STATE_META: Record<SectionState, { label: string; tone: string }> = {
  available: { label: "Live", tone: "text-emerald-600 dark:text-emerald-400" },
  stale: { label: "Stale", tone: "text-amber-600 dark:text-amber-400" },
  partial: { label: "Partial", tone: "text-amber-600 dark:text-amber-400" },
  indexing: { label: "Indexing", tone: "text-sky-600 dark:text-sky-400" },
  unavailable: { label: "Unavailable", tone: "text-muted-foreground" },
};

export const HEALTH_META: Record<HealthStatus, { label: string; dot: string; text: string }> = {
  healthy: { label: "Healthy", dot: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" },
  warning: { label: "Warning", dot: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" },
  critical: { label: "Critical", dot: "bg-red-500", text: "text-red-600 dark:text-red-400" },
  unavailable: { label: "Not measured", dot: "bg-muted-foreground/40", text: "text-muted-foreground" },
};

export const SEVERITY_META: Record<RiskSeverity, { label: string; dot: string; badge: string }> = {
  critical: { label: "Critical", dot: "bg-red-500", badge: "bg-red-500/10 text-red-600 dark:text-red-400" },
  high: { label: "High", dot: "bg-orange-500", badge: "bg-orange-500/10 text-orange-600 dark:text-orange-400" },
  medium: { label: "Medium", dot: "bg-amber-500", badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  low: { label: "Low", dot: "bg-sky-500", badge: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
};

/** A dimension/drilldown target string from the backend → a real Codebase view id. */
export function toViewId(drilldown: string | null | undefined): CodebaseViewId | null {
  const map: Record<string, CodebaseViewId> = {
    dependencies: "dependencies",
    metrics: "metrics",
    issues: "issues",
    modules: "modules",
    schema: "schema",
    overview: "overview",
  };
  return drilldown ? map[drilldown] ?? null : null;
}

/** Compact relative time ("2h ago", "3d ago"). Absolute ISO is exposed via title=
 * on the element so screen readers / hover get the exact timestamp too. */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const s = Math.round((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(mo / 12)}y ago`;
}

/** Grouped-thousands formatter, null-safe → em dash for "not measured". */
export function fmt(n: number | null | undefined): string {
  return n == null ? "—" : n.toLocaleString();
}
