import { describe, expect, it } from "vitest";

import { EDocumentKind, EDocumentSource, type IDocument } from "@/types";

import {
  agentDocumentForStory,
  canDeleteDocument,
  documentsForStory,
  messageForDeleteFailure,
} from "./story-documents";

const base: IDocument = {
  id: "d1",
  workspace_slug: "acme",
  project_id: "p1",
  project_name: "Demo",
  title: "Brief",
  kind: EDocumentKind.Brief,
  workflow: "bmad-product-brief",
  content: "# Hi",
  comments: [],
  is_draft: false,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  source: EDocumentSource.Agent,
  story_id: "s1",
  workspace_path: "docs/brief.md",
  file_name: "brief.md",
  mime_type: "text/markdown",
};

describe("documentsForStory", () => {
  it("returns docs matching story_id", () => {
    const docs = [
      { ...base, id: "a", story_id: "s1" },
      { ...base, id: "b", story_id: "s2" },
    ];
    expect(documentsForStory(docs, "s1", null)).toHaveLength(1);
    expect(documentsForStory(docs, "s1", null)[0].id).toBe("a");
  });

  it("falls back to workflow match when story_id unset", () => {
    const docs = [{ ...base, id: "c", story_id: null, workflow: "bmad-prd" }];
    expect(documentsForStory(docs, "s9", "bmad-prd")).toHaveLength(1);
  });
});

describe("canDeleteDocument", () => {
  it("allows user source only", () => {
    expect(canDeleteDocument({ ...base, source: EDocumentSource.User })).toBe(true);
    expect(canDeleteDocument({ ...base, source: EDocumentSource.Agent })).toBe(false);
  });
});

describe("agentDocumentForStory", () => {
  it("returns the agent doc when present", () => {
    const docs = [
      { ...base, id: "u", source: EDocumentSource.User, story_id: "s1" },
      { ...base, id: "a", source: EDocumentSource.Agent, story_id: "s1" },
    ];
    expect(agentDocumentForStory(docs, "s1", null)?.id).toBe("a");
  });
});

describe("messageForDeleteFailure", () => {
  // Each status earns its own message: "ask someone else", "it is already gone"
  // and "try again" are three different next actions for the user.
  it("tells a forbidden user they lack permission", () => {
    expect(messageForDeleteFailure({ status: 403 })).toMatch(/permission/i);
  });

  it("explains a stale list when the attachment is already gone", () => {
    expect(messageForDeleteFailure({ status: 404 })).toMatch(/already deleted/i);
  });

  it("names the concurrent case so refreshing is the obvious step", () => {
    expect(messageForDeleteFailure({ status: 409 })).toMatch(/someone else/i);
  });

  it("treats a server error as worth retrying", () => {
    expect(messageForDeleteFailure({ status: 500 })).toMatch(/try again/i);
    expect(messageForDeleteFailure({ status: 503 })).toMatch(/try again/i);
  });

  it("falls back to a connection message when there is no status", () => {
    expect(messageForDeleteFailure(new Error("network down"))).toMatch(/connection/i);
    expect(messageForDeleteFailure(undefined)).toMatch(/connection/i);
    expect(messageForDeleteFailure(null)).toMatch(/connection/i);
  });
});
