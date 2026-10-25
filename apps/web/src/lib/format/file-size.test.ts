import { describe, expect, it } from "vitest";

import { estimateContentBytes, formatFileSize } from "./file-size";

describe("formatFileSize", () => {
  it("formats bytes and kilobytes", () => {
    expect(formatFileSize(512)).toBe("512 B");
    expect(formatFileSize(54 * 1024)).toBe("54 KB");
  });

  it("returns dash for zero", () => {
    expect(formatFileSize(0)).toBe("—");
  });
});

describe("estimateContentBytes", () => {
  it("counts utf-8 length", () => {
    expect(estimateContentBytes("hello")).toBe(5);
    expect(estimateContentBytes("")).toBe(0);
  });
});
