import { describe, expect, it } from "vitest";

import { imageFilesFrom } from "./image-paste";

// Minimal DataTransfer-like stub — only `.files` is read by the guard.
const dt = (files: File[]) => ({ files } as unknown as DataTransfer);
const file = (type: string) => new File([""], "x", { type });

describe("imageFilesFrom", () => {
  it("returns image files so paste/drop is intercepted", () => {
    expect(imageFilesFrom(dt([file("image/png"), file("image/jpeg")]))).toHaveLength(2);
  });

  it("ignores non-image files (paste falls through to default handling)", () => {
    expect(imageFilesFrom(dt([file("text/plain"), file("application/pdf")]))).toHaveLength(0);
  });

  it("handles a null clipboard/drop payload", () => {
    expect(imageFilesFrom(null)).toEqual([]);
  });
});
