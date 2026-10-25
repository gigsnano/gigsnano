import { describe, expect, it } from "vitest";

import {
  attachmentContentToBlob,
  attachmentDisplayName,
  attachmentPreviewKind,
  imagePreviewSrc,
  isPlaceholderUploadContent,
} from "./attachment-preview";
import { EDocumentKind, EDocumentSource, type IDocument } from "@/types";

const base: IDocument = {
  id: "d1",
  workspace_slug: "acme",
  project_id: "p1",
  project_name: "Demo",
  title: "Spec",
  kind: EDocumentKind.Other,
  workflow: null,
  content: "# Spec\n\nBody",
  comments: [],
  is_draft: false,
  source: EDocumentSource.User,
  story_id: "s1",
  workspace_path: null,
  file_name: "spec.md",
  mime_type: "text/markdown",
  created_at: "2026-01-01",
  updated_at: "2026-01-01",
};

describe("attachmentDisplayName", () => {
  it("prefers file_name over title", () => {
    expect(attachmentDisplayName(base)).toBe("spec.md");
  });
});

describe("attachmentPreviewKind", () => {
  it("detects markdown uploads", () => {
    expect(attachmentPreviewKind(base)).toBe("markdown");
  });

  it("detects images by mime", () => {
    expect(
      attachmentPreviewKind({ ...base, mime_type: "image/jpeg", file_name: "photo.jpg" }),
    ).toBe("image");
  });
});

describe("isPlaceholderUploadContent", () => {
  it("flags placeholder upload bodies", () => {
    expect(
      isPlaceholderUploadContent({
        ...base,
        title: "photo.jpg",
        content: "# photo.jpg\n\nUploaded reference file.",
      }),
    ).toBe(true);
  });
});

describe("imagePreviewSrc", () => {
  it("passes through data URLs", () => {
    const src = "data:image/png;base64,abc";
    expect(imagePreviewSrc({ ...base, content: src, mime_type: "image/png" })).toBe(src);
  });
});

describe("attachmentContentToBlob", () => {
  it("decodes data URL payloads to binary", async () => {
    // 1x1 red PNG
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const blob = attachmentContentToBlob({
      ...base,
      content: dataUrl,
      mime_type: "image/png",
      file_name: "pixel.png",
    });
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
    const buf = new Uint8Array(await blob.arrayBuffer());
    expect(buf[0]).toBe(0x89);
    expect(buf[1]).toBe(0x50);
  });
});
