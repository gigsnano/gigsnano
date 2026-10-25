import { describe, expect, it } from "vitest";

import {
  formatLlmUsageOperation,
  formatLlmUsageSource,
  formatTokenCount,
  formatUsd,
} from "./format-source";

describe("formatLlmUsageSource", () => {
  it("formats known source ids", () => {
    expect(formatLlmUsageSource("bmad_story")).toBe("BMAD Story");
    expect(formatLlmUsageSource("gigs_ai")).toBe("GigsAI");
  });

  it("falls back for unknown source ids", () => {
    expect(formatLlmUsageSource("new_source")).toBe("new_source");
    expect(formatLlmUsageSource(null)).toBe("Unknown");
  });
});

describe("formatLlmUsageOperation", () => {
  it("formats known operation ids", () => {
    expect(formatLlmUsageOperation("stream_turn")).toBe("Stream turn");
    expect(formatLlmUsageOperation("extract")).toBe("Extract");
    expect(formatLlmUsageOperation("finalize_description")).toBe("Finalize description");
  });

  it("falls back for unknown operation ids", () => {
    expect(formatLlmUsageOperation("new_operation")).toBe("new_operation");
    expect(formatLlmUsageOperation(undefined)).toBe("Unknown");
  });
});

describe("value formatters", () => {
  it("formats token counts with separators", () => {
    expect(formatTokenCount(1234567)).toBe("1,234,567");
    expect(formatTokenCount(undefined)).toBe("0");
  });

  it("formats usd and tolerates missing cost", () => {
    expect(formatUsd(12.3456)).toBe("$12.3456");
    expect(formatUsd(null)).toBe("—");
  });
});
