import { describe, expect, it } from "vitest";

import type { IDocument } from "@/types";
import type { IPageWithProject } from "@/types/docs/page";

import { buildDocsFeed } from "./docs-feed";

const doc = (id: string, updated_at: string): IDocument =>
  ({ id, updated_at, title: id, kind: "document" } as unknown as IDocument);

const page = (id: string, updated_at: string): IPageWithProject =>
  ({
    id,
    updated_at,
    title: id,
    project_id: "p",
    project_name: "P",
  } as unknown as IPageWithProject);

describe("buildDocsFeed", () => {
  it("merges documents and pages newest-first when filter is all", () => {
    const feed = buildDocsFeed(
      [doc("d1", "2026-01-01T00:00:00Z")],
      [page("pg1", "2026-02-01T00:00:00Z")],
      "all",
    );
    expect(feed.map((i) => i.id)).toEqual(["pg1", "d1"]);
    expect(feed[0].kind).toBe("page");
  });

  it("excludes pages when filter is documents", () => {
    const feed = buildDocsFeed(
      [doc("d1", "2026-01-01T00:00:00Z")],
      [page("pg1", "2026-02-01T00:00:00Z")],
      "documents",
    );
    expect(feed.map((i) => i.kind)).toEqual(["document"]);
  });

  it("excludes documents when filter is pages", () => {
    const feed = buildDocsFeed(
      [doc("d1", "2026-01-01T00:00:00Z")],
      [page("pg1", "2026-02-01T00:00:00Z")],
      "pages",
    );
    expect(feed.map((i) => i.kind)).toEqual(["page"]);
  });

  it("returns empty for empty inputs", () => {
    expect(buildDocsFeed([], [], "all")).toEqual([]);
  });
});
