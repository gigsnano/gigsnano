import type { IDocument } from "@/types";
import type { IPageWithProject } from "@/types/docs/page";

export type TDocsFilter = "all" | "documents" | "pages";

export type TDocsFeedItem =
  | { kind: "document"; id: string; updated_at: string; doc: IDocument }
  | { kind: "page"; id: string; updated_at: string; page: IPageWithProject };

/** Merge documents and pages into one feed, filtered and sorted newest-first. */
export function buildDocsFeed(
  documents: IDocument[],
  pages: IPageWithProject[],
  filter: TDocsFilter,
): TDocsFeedItem[] {
  const items: TDocsFeedItem[] = [];

  if (filter !== "pages") {
    for (const doc of documents) {
      items.push({ kind: "document", id: doc.id, updated_at: doc.updated_at, doc });
    }
  }
  if (filter !== "documents") {
    for (const page of pages) {
      items.push({ kind: "page", id: page.id, updated_at: page.updated_at, page });
    }
  }

  // ISO 8601 strings sort lexicographically in chronological order.
  return items.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}
