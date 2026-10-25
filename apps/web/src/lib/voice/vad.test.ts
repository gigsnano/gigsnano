import { describe, expect, it } from "vitest";

import { DEFAULT_VAD_CONFIG, initVad, pushFrame, type IVadState } from "./vad";

const CFG = DEFAULT_VAD_CONFIG;

/** Feed frames, returning the final state and every event emitted. */
function feed(state: IVadState, rms: number[]): { state: IVadState; events: string[] } {
  const events: string[] = [];
  for (const value of rms) {
    const next = pushFrame(state, value, CFG);
    state = next.state;
    if (next.event !== "none") events.push(next.event);
  }
  return { state, events };
}

const CALIBRATION = Array<number>(CFG.calibrationFrames).fill(0.01);
const SILENCE_FRAMES = Math.ceil(CFG.hangoverMs / CFG.frameMs);

describe("vad", () => {
  it("calibrates from the opening silence rather than a fixed threshold", () => {
    const { state } = feed(initVad(), CALIBRATION);
    expect(state.calibrating).toBe(false);
    expect(state.noiseFloor).toBeCloseTo(0.01, 3);
  });

  it("emits no events while still calibrating", () => {
    const { events } = feed(initVad(), [0.9, 0.9]);
    expect(events).toEqual([]);
  });

  it("emits speech_start once when energy rises above the floor", () => {
    const { events } = feed(initVad(), [...CALIBRATION, 0.5, 0.6, 0.5]);
    expect(events).toEqual(["speech_start"]);
  });

  it("emits speech_end only after the hangover window of silence", () => {
    const start = feed(initVad(), [...CALIBRATION, 0.5]);
    const short = feed(start.state, Array<number>(SILENCE_FRAMES - 1).fill(0.01));
    expect(short.events).toEqual([]);

    const complete = feed(short.state, [0.01]);
    expect(complete.events).toEqual(["speech_end"]);
    expect(complete.state.speaking).toBe(false);
  });

  it("does not end an utterance on a mid-sentence pause shorter than the hangover", () => {
    const start = feed(initVad(), [...CALIBRATION, 0.5]);
    const pause = feed(start.state, [
      ...Array<number>(SILENCE_FRAMES - 1).fill(0.01),
      0.5, // speech resumes
      ...Array<number>(SILENCE_FRAMES - 1).fill(0.01),
    ]);
    expect(pause.events).toEqual([]);
    expect(pause.state.speaking).toBe(true);
  });

  it("stays silent in a room whose noise sits above another room's speech", () => {
    // Loud office: the floor calibrates high, so steady noise never reads as speech.
    const loud = feed(initVad(), Array<number>(CFG.calibrationFrames).fill(0.3));
    const { events } = feed(loud.state, Array<number>(20).fill(0.3));
    expect(events).toEqual([]);
    expect(loud.state.noiseFloor).toBeCloseTo(0.3, 3);
  });
});
