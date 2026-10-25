import { describe, expect, it } from "vitest";

import { EDocumentSource } from "@/types";

import {
  DOCUMENT_SOURCE_META,
  resolveDocumentSourceMeta,
} from "./document-source-meta";

describe("DOCUMENT_SOURCE_META", () => {
  it("covers every source", () => {
    for (const s of Object.values(EDocumentSource)) {
      expect(DOCUMENT_SOURCE_META[s].label).toBeTruthy();
      expect(DOCUMENT_SOURCE_META[s].badgeClass).toMatch(/border-/);
    }
  });
});

describe("resolveDocumentSourceMeta", () => {
  it("resolves known sources to their meta", () => {
    expect(resolveDocumentSourceMeta(EDocumentSource.Agent).label).toBe("AI");
    expect(resolveDocumentSourceMeta(EDocumentSource.User).label).toBe("Upload");
  });

  it("falls back to a neutral badge for missing/unknown sources", () => {
    // The live backend may omit `source`; this must never crash the caller.
    for (const bad of [undefined, null, "", "mystery"]) {
      const meta = resolveDocumentSourceMeta(bad as never);
      expect(meta.label).toBeTruthy();
      expect(meta.badgeClass).toMatch(/border-/);
    }
  });
});
