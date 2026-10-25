/**
 * Utterance endpointing: decides when the user has stopped talking.
 *
 * A pure reducer over frame energies, like session-machine.ts, so the behaviour
 * that matters can be tested without a microphone — specifically the negative:
 * a mid-sentence pause must NOT end the utterance, because cutting someone off
 * mid-thought is the failure users notice and never forgive.
 *
 * The noise floor is measured from the opening silence rather than hardcoded.
 * A threshold tuned at a quiet desk truncates every sentence in an open-plan
 * office, and one tuned for the office ignores a quiet speaker. This is the
 * calibration knob; it is not optional.
 *
 * ponytail: energy + hangover, not a WASM model. Shipping a Silero download for
 * something arithmetic may solve is the wrong first move — but the interface is
 * deliberately narrow so swapping in a model later touches only this file.
 */

export interface IVadConfig {
  /** Milliseconds of sub-threshold audio that ends an utterance. */
  hangoverMs: number;
  /** Duration one frame represents. */
  frameMs: number;
  /** How far above the noise floor counts as speech (multiplier). */
  margin: number;
  /** Frames of opening audio averaged into the noise floor. */
  calibrationFrames: number;
  /** Floor under the noise floor, so a digitally silent mic can't make everything speech. */
  minFloor: number;
}

export const DEFAULT_VAD_CONFIG: IVadConfig = {
  hangoverMs: 700,
  frameMs: 50,
  margin: 2.5,
  calibrationFrames: 10, // 500ms at the default frame size
  minFloor: 0.005,
};

export type TVadEvent = "none" | "speech_start" | "speech_end";

export interface IVadState {
  noiseFloor: number;
  calibrating: boolean;
  speaking: boolean;
  /** Consecutive sub-threshold milliseconds while speaking. */
  silentMs: number;
  calibrationSum: number;
  framesSeen: number;
}

export function initVad(): IVadState {
  return {
    noiseFloor: 0,
    calibrating: true,
    speaking: false,
    silentMs: 0,
    calibrationSum: 0,
    framesSeen: 0,
  };
}

/** Feed one frame's RMS energy. Returns the next state and any event it caused. */
export function pushFrame(
  state: IVadState,
  rms: number,
  config: IVadConfig = DEFAULT_VAD_CONFIG,
): { state: IVadState; event: TVadEvent } {
  if (state.calibrating) {
    const framesSeen = state.framesSeen + 1;
    const calibrationSum = state.calibrationSum + rms;
    if (framesSeen < config.calibrationFrames) {
      return { state: { ...state, framesSeen, calibrationSum }, event: "none" };
    }
    return {
      state: {
        ...state,
        framesSeen,
        calibrationSum,
        calibrating: false,
        noiseFloor: Math.max(calibrationSum / framesSeen, config.minFloor),
      },
      event: "none",
    };
  }

  const isSpeech = rms > state.noiseFloor * config.margin;

  if (!state.speaking) {
    return isSpeech
      ? { state: { ...state, speaking: true, silentMs: 0 }, event: "speech_start" }
      : { state, event: "none" };
  }

  if (isSpeech) return { state: { ...state, silentMs: 0 }, event: "none" };

  const silentMs = state.silentMs + config.frameMs;
  if (silentMs < config.hangoverMs) return { state: { ...state, silentMs }, event: "none" };
  return { state: { ...state, speaking: false, silentMs: 0 }, event: "speech_end" };
}
