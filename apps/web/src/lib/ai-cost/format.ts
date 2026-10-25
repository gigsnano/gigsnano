/**
 * Money display, always in dollars.
 * - exact 0        → "$0.00"
 * - 0 < c < 1      → "<$0.01"  (never render a nonzero cost as $0.00)
 * - otherwise      → "$0.03" / "$4.30"
 *
 * Was ¢-under-a-dollar, $-above. One unit reads better in a range ("$0.02–0.08")
 * and stops a 3c figure and a $4.30 figure looking like different scales.
 */
export function formatCostCents(cents: number): string {
  if (cents <= 0) return "$0.00";
  // The one case a plain toFixed(2) gets wrong: real sub-cent costs exist and
  // must not render as free.
  if (cents < 1) return "<$0.01";
  return `$${(cents / 100).toFixed(2)}`;
}

const OPERATION_LABELS: Record<string, string> = {
  stream_turn: "Stream turn",
  extract: "Extract",
  finalize_description: "Finalize description",
};

const SOURCE_LABELS: Record<string, string> = {
  bmad_story: "BMAD Story",
  gigs_ai: "GigsAI",
};

/**
 * Labels for LLM usage rows. These live here rather than under `admin/` because
 * user-facing receipts need them too, and billing must not import from admin.
 * Unknown values pass through: a new backend operation should read as its raw
 * name, not as "Unknown".
 */
export function formatAiOperation(operation: string | null | undefined): string {
  if (!operation) return "Unknown";
  return OPERATION_LABELS[operation] ?? operation;
}

export function formatAiSource(source: string | null | undefined): string {
  if (!source) return "Unknown";
  return SOURCE_LABELS[source] ?? source;
}

const tokenFormatter = new Intl.NumberFormat("en-US");

export function formatTokenCount(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "0";
  return tokenFormatter.format(Math.max(0, Math.round(value)));
}
