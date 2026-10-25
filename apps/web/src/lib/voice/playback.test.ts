import { describe, expect, it, vi } from "vitest";

import { PlaybackQueue, type IAudioSink } from "./playback";

function fakeSink() {
  const played: number[] = [];
  let resolveCurrent: (() => void) | null = null;
  const sink: IAudioSink = {
    play: (chunk) =>
      new Promise<void>((resolve) => {
        played.push(chunk.byteLength);
        resolveCurrent = resolve;
      }),
    stop: vi.fn(),
  };
  return { sink, played, finish: () => resolveCurrent?.() };
}

function fakeSinkWithIndependentResolvers() {
  const played: number[] = [];
  const resolvers: Array<() => void> = [];
  const sink: IAudioSink = {
    play: (chunk) =>
      new Promise<void>((resolve) => {
        played.push(chunk.byteLength);
        resolvers.push(resolve);
      }),
    stop: vi.fn(),
  };
  return { sink, played, resolveAt: (index: number) => resolvers[index]?.() };
}

const buf = (n: number) => new ArrayBuffer(n);

describe("PlaybackQueue", () => {
  it("plays chunks in order, one at a time", async () => {
    const { sink, played, finish } = fakeSink();
    const queue = new PlaybackQueue(sink);

    queue.enqueue(buf(1));
    queue.enqueue(buf(2));
    await Promise.resolve();
    expect(played).toEqual([1]); // second chunk waits

    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(played).toEqual([1, 2]);
  });

  it("stop() drops everything still queued", async () => {
    const { sink, played, finish } = fakeSink();
    const queue = new PlaybackQueue(sink);

    queue.enqueue(buf(1));
    queue.enqueue(buf(2));
    queue.enqueue(buf(3));
    await Promise.resolve();

    queue.stop();
    expect(sink.stop).toHaveBeenCalled();
    expect(queue.pending).toBe(0);

    finish();
    await Promise.resolve();
    await Promise.resolve();
    // Barge-in must not let a queued sentence surface after the user cut in.
    expect(played).toEqual([1]);
  });

  it("accepts new audio after a stop", async () => {
    const { sink, played, finish } = fakeSink();
    const queue = new PlaybackQueue(sink);
    queue.enqueue(buf(1));
    await Promise.resolve();
    queue.stop();
    finish();
    await Promise.resolve();

    queue.enqueue(buf(9));
    await Promise.resolve();
    expect(played).toEqual([1, 9]);
  });

  it("reports isPlaying honestly", async () => {
    const { sink, finish } = fakeSink();
    const queue = new PlaybackQueue(sink);
    expect(queue.isPlaying).toBe(false);
    queue.enqueue(buf(1));
    await Promise.resolve();
    expect(queue.isPlaying).toBe(true);
    finish();
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.isPlaying).toBe(false);
  });

  it("epoch guard prevents stale drain from killing playing state", async () => {
    const { sink, played, resolveAt } = fakeSinkWithIndependentResolvers();
    const queue = new PlaybackQueue(sink);

    queue.enqueue(buf(1));
    await Promise.resolve();
    expect(queue.isPlaying).toBe(true);

    // While chunk 1 is playing, stop and enqueue chunk 2
    queue.stop();
    expect(queue.isPlaying).toBe(false);

    queue.enqueue(buf(2));
    await Promise.resolve();
    expect(queue.isPlaying).toBe(true);
    expect(played).toEqual([1, 2]); // chunk 2 is now playing

    // Now let the FIRST chunk's play promise resolve (while chunk 2 is still playing)
    resolveAt(0);
    // Drain enough microtasks to guarantee the stale continuation has fired.
    // The .catch().then() chain adds microtask layers, so multiple ticks are needed.
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    // Without the epoch guard, the stale drain from chunk 1 would set playing=false
    // even though chunk 2 is still playing and unresolved
    expect(queue.isPlaying).toBe(true);
    expect(played).toEqual([1, 2]);

    // Clean up - resolve chunk 2
    resolveAt(1);
    await Promise.resolve();
    await Promise.resolve();
    expect(queue.isPlaying).toBe(false);
  });
});
