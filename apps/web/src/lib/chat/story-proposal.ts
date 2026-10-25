import { EStoryType } from "@/types";

export interface IStoryProposal {
  title: string;
  type: EStoryType;
  description: string;
}

const VALID_TYPES = new Set<string>(Object.values(EStoryType));

// Matches ```gigs:story\n{...}\n``` blocks (non-greedy, across lines).
const BLOCK_RE = /```gigs:story\n([\s\S]*?)\n```/g;

function coerceType(value: unknown): EStoryType {
  return typeof value === "string" && VALID_TYPES.has(value)
    ? (value as EStoryType)
    : EStoryType.Story;
}

/** Extract `gigs:story` fenced JSON blocks. Unparseable/titleless blocks are skipped. */
export function parseStoryProposals(text: string): IStoryProposal[] {
  const proposals: IStoryProposal[] = [];
  for (const match of text.matchAll(BLOCK_RE)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    if (typeof parsed !== "object" || parsed === null) continue;
    const obj = parsed as Record<string, unknown>;
    const title = typeof obj.title === "string" ? obj.title.trim() : "";
    if (!title) continue;
    proposals.push({
      title,
      type: coerceType(obj.type),
      description: typeof obj.description === "string" ? obj.description : "",
    });
  }
  return proposals;
}

/** Text with `gigs:story` blocks removed, for clean display. */
export function stripStoryProposals(text: string): string {
  return text.replace(BLOCK_RE, "").trim();
}
