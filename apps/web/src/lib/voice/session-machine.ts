/**
 * Client voice-session state machine (GIN-504).
 *
 * Pure reducer, deliberately separate from the component, because the one
 * behaviour that matters most here is a *negative*: the UI must never show
 * "Listening" when capture has stopped. That is a claim about state
 * transitions, and testing it through a React tree would test the tree instead.
 *
 * Events arrive from the backend's canonical stream. Out-of-order events are
 * dropped rather than applied — the server already refuses to emit them
 * (`ordered()`), so one arriving here means something is wrong, and replaying a
 * stale partial over a fresh final is exactly the caption glitch users read as
 * the agent mishearing them.
 */

import { EVoiceEvent, EVoicePhase, type IVoiceEvent } from "@/types/voice";

export interface ITranscriptLine {
  id: string;
  text: string;
}

export interface IVoiceState {
  phase: EVoicePhase;
  /** In-flight transcript. Cleared the moment it is superseded by a final. */
  partial: string;
  /** Committed transcript lines, oldest first. Ids are stable so an edited
   *  line keeps its React identity and its input does not lose focus. */
  finals: ITranscriptLine[];
  /** Set while the user holds the mic. Capture, not phase — see canListen. */
  capturing: boolean;
  muted: boolean;
  lastSeq: number;
  errorCode: string;
  retryable: boolean;
}

export const initialVoiceState: IVoiceState = {
  phase: EVoicePhase.Idle,
  partial: "",
  finals: [],
  capturing: false,
  muted: false,
  lastSeq: 0,
  errorCode: "",
  retryable: false,
};

export type VoiceAction =
  | { kind: "connect" }
  | { kind: "press" }
  | { kind: "release" }
  | { kind: "mute"; on: boolean }
  | { kind: "barge_in" }
  | { kind: "cancelTurn" }
  | { kind: "editFinal"; index: number; text: string }
  | { kind: "reconnecting" }
  | { kind: "end" }
  | { kind: "event"; event: IVoiceEvent };

/**
 * The invariant the AC names: listening is only ever shown while capture is
 * actually running and the mic is not muted. Derived rather than stored, so no
 * transition can leave the two out of sync.
 */
export function isListening(state: IVoiceState): boolean {
  return state.phase === EVoicePhase.Listening && state.capturing && !state.muted;
}

/** What assistive tech announces. Empty string means "nothing worth saying". */
export function announcement(state: IVoiceState): string {
  switch (state.phase) {
    case EVoicePhase.Connecting:
      return "Connecting";
    case EVoicePhase.Listening:
      return isListening(state) ? "Listening" : "Microphone muted";
    case EVoicePhase.Processing:
      return "Thinking";
    case EVoicePhase.Speaking:
      return "Assistant speaking";
    case EVoicePhase.Paused:
      return "Paused";
    case EVoicePhase.Reconnecting:
      return "Connection lost, reconnecting";
    case EVoicePhase.Error:
      return "Voice unavailable. Text chat still works.";
    default:
      return "";
  }
}

export function voiceReducer(state: IVoiceState, action: VoiceAction): IVoiceState {
  switch (action.kind) {
    case "connect":
      return { ...state, phase: EVoicePhase.Connecting, errorCode: "" };

    case "press":
      // Push-to-talk. Pressing while the agent speaks is a barge-in, so the
      // same gesture both stops it talking and starts us listening.
      return {
        ...state,
        capturing: true,
        phase: EVoicePhase.Listening,
        partial: "",
      };

    case "release":
      // Capture stops immediately; the phase moves on to processing. Leaving
      // phase at Listening here is precisely the bug isListening guards.
      return { ...state, capturing: false, phase: EVoicePhase.Processing };

    case "mute":
      return { ...state, muted: action.on };

    // The hands-free call loop (GIN-518) dispatches this on every VAD
    // speech_start regardless of current phase (it doesn't know in advance
    // whether the agent is mid-reply), so it must be a no-op (identity, for
    // the reducer's equality tests) outside Speaking rather than stomping
    // Listening/Processing/Idle state. A press-driven push-to-talk barge-in
    // doesn't need this guard — it dispatches `press` instead, which already
    // unconditionally re-enters Listening — so there is only the one action.
    case "barge_in":
      return state.phase === EVoicePhase.Speaking
        ? { ...state, phase: EVoicePhase.Listening, partial: "" }
        : state;

    case "cancelTurn":
      // The partial is discarded, the committed finals are not — the user
      // cancelled this turn, not the conversation.
      return { ...state, partial: "", capturing: false, phase: EVoicePhase.Paused };

    case "editFinal": {
      const finals = [...state.finals];
      if (action.index < 0 || action.index >= finals.length) return state;
      finals[action.index] = { ...finals[action.index], text: action.text };
      return { ...state, finals };
    }

    case "reconnecting":
      return { ...state, phase: EVoicePhase.Reconnecting, capturing: false, partial: "" };

    case "end":
      return { ...initialVoiceState };

    case "event":
      return applyEvent(state, action.event);

    default:
      return state;
  }
}

function applyEvent(state: IVoiceState, event: IVoiceEvent): IVoiceState {
  // Out of order. The server refuses to emit these, so one here means the
  // transport is confused — dropping beats replaying stale transcript.
  if (event.seq <= state.lastSeq) return state;
  const next = { ...state, lastSeq: event.seq };

  switch (event.type) {
    case EVoiceEvent.SessionStarted:
      return { ...next, phase: EVoicePhase.Listening };

    case EVoiceEvent.TranscriptPartial:
      // A partial arriving while muted or not capturing is stale audio from
      // before the user stopped. Showing it would put words in their mouth.
      if (!state.capturing || state.muted) return next;
      return { ...next, partial: event.text ?? "" };

    case EVoiceEvent.TranscriptFinal:
      return {
        ...next,
        partial: "",
        finals: event.text
          ? [...state.finals, { id: `${event.session_id}-${event.seq}`, text: event.text }]
          : state.finals,
      };

    case EVoiceEvent.TurnEnded:
      return { ...next, capturing: false, phase: EVoicePhase.Processing };

    case EVoiceEvent.SynthesisStarted:
      return { ...next, phase: EVoicePhase.Speaking };

    case EVoiceEvent.SynthesisDone:
      return { ...next, phase: EVoicePhase.Paused };

    case EVoiceEvent.Interrupted:
    case EVoiceEvent.Cancelled:
      return { ...next, phase: EVoicePhase.Paused, partial: "" };

    case EVoiceEvent.Error:
      return {
        ...next,
        phase: EVoicePhase.Error,
        capturing: false,
        errorCode: event.error_code ?? "unknown",
        retryable: Boolean(event.retryable),
      };

    case EVoiceEvent.SessionEnded:
      return { ...initialVoiceState, finals: state.finals };

    default:
      return next;
  }
}
