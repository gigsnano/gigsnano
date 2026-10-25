import { diffWords } from "diff";

import { htmlToPlainText } from "@/lib/format/html-to-text";

export interface IDiffSegment {
  value: string;
  added?: boolean;
  removed?: boolean;
}

/** Word-level diff of two rich-text descriptions, computed on their visible text
 * (tags stripped, whitespace collapsed) so markup noise never shows as a change. */
export function diffDescription(oldHtml: string, newHtml: string): IDiffSegment[] {
  const oldText = htmlToPlainText(oldHtml).replace(/\s+/g, " ").trim();
  const newText = htmlToPlainText(newHtml).replace(/\s+/g, " ").trim();
  return diffWords(oldText, newText).map((part) => ({
    value: part.value,
    added: part.added || undefined,
    removed: part.removed || undefined,
  }));
}
