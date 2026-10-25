/** priority_weight 0..3 → label + tokenized chip (mirrors the backend scale:
 * 0 = normal … 3 = strategic; feeds priority = max(impact, weight) at triage). */
export const WEIGHT_META: Record<number, { label: string; chip: string }> = {
  0: { label: "Standard", chip: "bg-muted text-muted-foreground border-border" },
  1: { label: "Priority", chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25" },
  2: { label: "Strategic", chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25" },
  3: { label: "Critical", chip: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30" },
};
