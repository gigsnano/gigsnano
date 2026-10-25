// Tableau 10 — the categorical palette graphify uses for community coloring.
// A fixed palette (cycled by community) reads as intentional and matches
// graphify's own graph.html; an open-ended hash→hue looks muddy by comparison.
const PALETTE = [
  "#4E79A7",
  "#F28E2B",
  "#E15759",
  "#76B7B2",
  "#59A14F",
  "#EDC948",
  "#B07AA1",
  "#FF9DA7",
  "#9C755F",
  "#BAB0AC",
] as const;

/**
 * Deterministic community/cluster key -> palette color. Community ids are
 * open-ended (a directory path, a graphify cluster id, …), so we hash the key
 * to an index into the fixed palette — same community, same color across
 * reloads, and always one of the curated hues (matches graphify).
 */
export function communityColor(key: string): string {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
}
