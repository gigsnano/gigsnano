import { describe, expect, it } from "vitest";

import type { IMeetingTranscriptSegment } from "@/types";

import { formatOffset, groupBySpeaker } from "./transcript";

describe("formatOffset", () => {
  it("formats seconds under an hour as mm:ss", () => {
    expect(formatOffset(0)).toBe("00:00");
    expect(formatOffset(65_000)).toBe("01:05");
  });

  it("formats an hour or more as h:mm:ss", () => {
    expect(formatOffset(3_725_000)).toBe("1:02:05");
  });
});

describe("groupBySpeaker", () => {
  const seg = (
    seq: number,
    speaker: string | null,
    text = `line ${seq}`,
  ): IMeetingTranscriptSegment => ({
    seq,
    speaker,
    text,
    start_ms: seq * 1000,
    end_ms: seq * 1000 + 900,
  });

  it("merges consecutive segments from the same speaker", () => {
    const groups = groupBySpeaker([
      seg(0, "Ada"),
      seg(1, "Ada"),
      seg(2, "Bob"),
      seg(3, "Ada"),
    ]);
    expect(groups).toHaveLength(3);
    expect(groups[0].speaker).toBe("Ada");
    expect(groups[0].segments).toHaveLength(2);
    expect(groups[0].key).toBe("0");
    expect(groups[1].speaker).toBe("Bob");
    expect(groups[1].segments).toHaveLength(1);
    expect(groups[2].speaker).toBe("Ada");
    expect(groups[2].segments).toHaveLength(1);
    expect(groups[2].key).toBe("3");
  });

  it("labels a null speaker as Speaker", () => {
    const groups = groupBySpeaker([seg(0, null)]);
    expect(groups[0].speaker).toBe("Speaker");
  });

  it("returns an empty array for no segments", () => {
    expect(groupBySpeaker([])).toEqual([]);
  });
});
