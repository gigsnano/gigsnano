import { describe, expect, it } from "vitest";

import { __testables } from "@/lib/voice/recorder";

const { downsample, encodeWav } = __testables;

/** Read a little-endian ASCII tag out of the header. */
function tag(view: DataView, offset: number, length: number): string {
  return Array.from({ length }, (_, i) => String.fromCharCode(view.getUint8(offset + i))).join("");
}

describe("wav encoding", () => {
  it("writes a header Azure will accept", async () => {
    // The recogniser rejects anything that is not 16kHz mono PCM RIFF, and a
    // wrong header fails as an opaque 400 — worth pinning byte by byte.
    const buffer = await encodeWav(new Float32Array([0, 0.5, -0.5]), 16_000).arrayBuffer();
    const view = new DataView(buffer);

    expect(tag(view, 0, 4)).toBe("RIFF");
    expect(tag(view, 8, 4)).toBe("WAVE");
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(16_000);
    expect(view.getUint16(34, true)).toBe(16); // bits
    expect(view.getUint32(40, true)).toBe(6); // 3 samples x 2 bytes
  });

  it("clamps samples instead of wrapping them", async () => {
    // A sample above 1.0 wrapping through Int16 becomes a loud click, which is
    // both unpleasant and hurts recognition.
    const buffer = await encodeWav(new Float32Array([2, -2]), 16_000).arrayBuffer();
    const view = new DataView(buffer);
    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x7fff);
  });

  it("round-trips a midpoint sample", async () => {
    const buffer = await encodeWav(new Float32Array([0.5]), 16_000).arrayBuffer();
    expect(new DataView(buffer).getInt16(44, true)).toBeCloseTo(0x7fff / 2, -1);
  });
});

describe("downsampling", () => {
  it("reduces 48kHz to 16kHz at a third of the length", () => {
    const input = new Float32Array(4800).fill(0.25);
    expect(downsample(input, 48_000, 16_000).length).toBe(1600);
  });

  it("averages the window rather than decimating", () => {
    // Nearest-neighbour would return the first sample of each window (1, 3);
    // averaging returns the mean (1.5, 3.5). Aliased speech transcribes badly.
    const input = new Float32Array([1, 2, 3, 4]);
    const out = downsample(input, 32_000, 16_000);
    expect(Array.from(out)).toEqual([1.5, 3.5]);
  });

  it("passes audio through untouched when already at the target rate", () => {
    const input = new Float32Array([0.1, 0.2]);
    expect(downsample(input, 16_000, 16_000)).toBe(input);
  });
});
