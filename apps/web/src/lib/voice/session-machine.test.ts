import { describe, expect, it } from "vitest";

import {
  announcement,
  initialVoiceState,
  isListening,
  voiceReducer,
  type IVoiceState,
} from "@/lib/voice/session-machine";
import { EVoiceEvent, EVoicePhase, type IVoiceEvent } from "@/types/voice";

function event(over: Partial<IVoiceEvent> & { type: EVoiceEvent; seq: number }): IVoiceEvent {
  return {
    version: 1,
    session_id: "vs_1",
    correlation_id: "corr-1",
    ...over,
  };
}

function run(actions: Parameters<typeof voiceReducer>[1][], from = initialVoiceState): IVoiceState {
  return actions.reduce(voiceReducer, from);
}

describe("voice session machine", () => {
  it("never shows listening once capture has stopped", () => {
    // The AC this file exists for. Release must not leave a "Listening" label up.
    const state = run([{ kind: "press" }, { kind: "release" }]);
    expect(state.capturing).toBe(false);
    expect(isListening(state)).toBe(false);
  });

  it("never shows listening while muted", () => {
    const state = run([{ kind: "press" }, { kind: "mute", on: true }]);
    expect(state.phase).toBe(EVoicePhase.Listening);
    expect(isListening(state)).toBe(false);
    expect(announcement(state)).toBe("Microphone muted");
  });

  it("shows listening only while genuinely capturing", () => {
    expect(isListening(run([{ kind: "press" }]))).toBe(true);
  });

  it("drops a partial that arrives after the user stopped talking", () => {
    // Stale audio from before release would otherwise put words in their mouth.
    const state = run([
      { kind: "press" },
      { kind: "release" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptPartial, seq: 1, text: "uhh" }) },
    ]);
    expect(state.partial).toBe("");
  });

  it("clears the partial when the final that corrects it arrives", () => {
    const state = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptPartial, seq: 1, text: "create a bugg" }) },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 2, text: "create a bug" }) },
    ]);
    expect(state.partial).toBe("");
    expect(state.finals.map((f) => f.text)).toEqual(["create a bug"]);
  });

  it("ignores out-of-order events rather than replaying stale transcript", () => {
    const state = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 5, text: "fresh" }) },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 3, text: "stale" }) },
    ]);
    expect(state.finals.map((f) => f.text)).toEqual(["fresh"]);
  });

  it("barge-in stops the agent speaking and starts listening", () => {
    const speaking = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.SynthesisStarted, seq: 1 }) },
    ]);
    expect(speaking.phase).toBe(EVoicePhase.Speaking);

    const barged = voiceReducer(speaking, { kind: "barge_in" });
    expect(barged.phase).toBe(EVoicePhase.Listening);
    expect(isListening(barged)).toBe(true);
  });

  it("cancelling a turn drops the partial but keeps committed transcript", () => {
    const state = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 1, text: "committed" }) },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptPartial, seq: 2, text: "half-said" }) },
      { kind: "cancelTurn" },
    ]);
    expect(state.partial).toBe("");
    expect(state.finals.map((f) => f.text)).toEqual(["committed"]);
  });

  it("lets the user correct a final before it backs a mutation preview", () => {
    const state = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 1, text: "creat a bug" }) },
      { kind: "editFinal", index: 0, text: "create a bug" },
    ]);
    expect(state.finals.map((f) => f.text)).toEqual(["create a bug"]);
  });

  it("keeps a line's identity across an edit so its input does not lose focus", () => {
    const before = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 1, text: "typo" }) },
    ]);
    const after = voiceReducer(before, { kind: "editFinal", index: 0, text: "fixed" });
    expect(after.finals[0].id).toBe(before.finals[0].id);
    expect(after.finals[0].text).toBe("fixed");
  });

  it("ignores an edit aimed at a line that does not exist", () => {
    const before = run([{ kind: "press" }]);
    expect(voiceReducer(before, { kind: "editFinal", index: 4, text: "x" })).toBe(before);
  });

  it("surfaces a provider error without claiming to still be listening", () => {
    const state = run([
      { kind: "press" },
      {
        kind: "event",
        event: event({ type: EVoiceEvent.Error, seq: 1, error_code: "provider_unavailable", retryable: true }),
      },
    ]);
    expect(state.phase).toBe(EVoicePhase.Error);
    expect(isListening(state)).toBe(false);
    expect(state.retryable).toBe(true);
    expect(announcement(state)).toContain("Text chat still works");
  });

  it("reconnecting stops capture so the mic indicator cannot lie", () => {
    const state = run([{ kind: "press" }, { kind: "reconnecting" }]);
    expect(state.capturing).toBe(false);
    expect(isListening(state)).toBe(false);
  });

  it("keeps the transcript when the session ends", () => {
    const state = run([
      { kind: "press" },
      { kind: "event", event: event({ type: EVoiceEvent.TranscriptFinal, seq: 1, text: "kept" }) },
      { kind: "event", event: event({ type: EVoiceEvent.SessionEnded, seq: 2 }) },
    ]);
    expect(state.finals.map((f) => f.text)).toEqual(["kept"]);
    expect(state.phase).toBe(EVoicePhase.Idle);
  });

  it("announces every non-idle phase", () => {
    const phases = [
      EVoicePhase.Connecting,
      EVoicePhase.Processing,
      EVoicePhase.Speaking,
      EVoicePhase.Paused,
      EVoicePhase.Reconnecting,
    ];
    for (const phase of phases) {
      expect(announcement({ ...initialVoiceState, phase })).not.toBe("");
    }
  });
});

describe("barge-in", () => {
  it("returns to Listening when the user speaks over the agent", () => {
    let state = { ...initialVoiceState, phase: EVoicePhase.Speaking, capturing: true };
    state = voiceReducer(state, { kind: "barge_in" });
    expect(state.phase).toBe(EVoicePhase.Listening);
    expect(state.partial).toBe("");
  });

  it("ignores barge-in when the agent is not speaking", () => {
    const listening = { ...initialVoiceState, phase: EVoicePhase.Listening };
    expect(voiceReducer(listening, { kind: "barge_in" })).toBe(listening);
  });
});
