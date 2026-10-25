"use client";

/**
 * Hands-free voice call loop (Task 13, GIN-518) — the screen the whole plan
 * exists for. Layers VAD-driven turn-taking (Task 11) and interruptible
 * playback (Task 12) over the existing session/transcribe primitives, and
 * speaks the agent's reply sentence-by-sentence against the SSE turn
 * contract so playback starts before the reply finishes.
 *
 * All mutable machinery — VAD state, the recorder, the playback queue, the
 * AudioContext, the in-flight turn's AbortController — lives in refs, touched
 * only inside handlers, never read during render.
 *
 * Mic acquisition and the audio graph are built inside `start()` — a plain
 * async handler, not a `useEffect` body — mirroring `voice-entry.tsx`'s own
 * `requestMic`. The only effect in this file has an empty dependency array
 * and exists purely as the unmount safety net (`voice-entry.tsx` does the
 * same): it guarantees `teardownCall` runs if the user navigates away
 * mid-call, which is the worst bug this screen can ship — a leaked frame
 * loop keeping the microphone hot after the screen is gone.
 *
 * Interrupting is not scoped to "the agent is Speaking": a turn can be
 * superseded while it is still Processing (the SSE stream hasn't produced
 * audio yet), and its `/speak/` response must still be prevented from
 * enqueueing later — otherwise the old turn can start talking over the
 * user's live microphone mid-utterance. `lib/voice/turn-generation.ts` (pure,
 * unit-tested there) tracks which turn's generation is current; a superseded
 * turn's async work checks its own captured generation against it before
 * acting, the same epoch idea `PlaybackQueue`/`createAudioSink` already use
 * for barge-in.
 *
 * The recorder shares this hook's own long-lived mic stream/AudioContext
 * (via `recorder.ts`'s optional `ISharedAudioSource`) instead of opening a
 * second one per utterance — see `recorder.ts` for the ownership contract
 * that makes this safe for its other caller, `voice-panel.tsx`.
 *
 * Two rules the first cut of this file got wrong, both worth stating:
 *
 * 1. **A terminal error tears the call down.** Emitting the error alone put
 *    the reducer in `Error` — "Voice unavailable" — while the rAF/VAD loop
 *    kept running and the microphone stayed open, still spending turns. Every
 *    such path now goes through `fail()`, which emits *and* stops the
 *    hardware; see its comment.
 * 2. **A proposal is confirmed, not narrated.** The write half of the backend
 *    contract (`.../confirm/`, hash-bound) is called from `confirmProposal`,
 *    and the receipt it returns is what the screen renders. A proposal the
 *    user can read but not apply is a feature that only looks finished.
 */

import { useEffect, useReducer, useRef, useState } from "react";

import {
  useEndVoiceSession,
  useStartVoiceSession,
  useTranscribe,
  useVoicePolicy,
} from "@/hooks/voice/use-voice";
import { startRecording, type ISharedAudioSource } from "@/lib/voice/recorder";
import { createAudioSink, PlaybackQueue } from "@/lib/voice/playback";
import { DEFAULT_VAD_CONFIG, initVad, pushFrame, type IVadState } from "@/lib/voice/vad";
import { initialVoiceState, voiceReducer, type ITranscriptLine } from "@/lib/voice/session-machine";
import {
  finishTurn,
  initialTurnGenState,
  isCurrentTurn,
  startTurn,
  supersedeActiveTurn,
  type ITurnGenState,
} from "@/lib/voice/turn-generation";
import {
  EVoiceEvent,
  EVoicePhase,
  type IProposalField,
  type IReceipt,
  type IVoiceCredential,
} from "@/types/voice";
import type { IAgent } from "@/types";

// ponytail: the same fallback APIService.ts's BASE_URL uses, duplicated
// rather than exported from it — turn/speak need a raw fetch for SSE reads
// and binary audio, which APIService.request (always `res.json()`) can't do,
// and this task's file scope doesn't include touching api.service.ts.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000/api";

/** A frame of the `.../turn/` SSE contract. Built to the exact fixed shape in
 *  the task brief — a local type rather than reusing `IMutationProposal` /
 *  `IReceipt` / `IClarification`, which were shaped for the assistant-ui text
 *  chat and don't match this contract's field names 1:1. */
export type TVoiceTurnEvent =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; summary: string }
  | { type: "clarification"; field: string; question: string; candidates: unknown[] }
  | {
      type: "proposal";
      hash: string;
      action: string;
      target_code?: string;
      fields: IProposalField[];
    }
  | { type: "receipt"; outcome: string; code?: string; url?: string }
  | { type: "error"; code: string; retryable: boolean };

export type TVoiceProposal = Extract<TVoiceTurnEvent, { type: "proposal" }>;

export interface IToolChip {
  id: string;
  name: string;
  summary: string;
}

const SENTENCE_END = /[.!?]\s*$/;

/** Parses `.../turn/`'s SSE body (`data: {json}\n\n`, terminated by
 *  `data: [DONE]`) — module scope, mirroring `readRoomStream`, so the
 *  `for await` control flow stays out of the React-Compiler-compiled hook. */
async function* readTurnStream(res: Response): AsyncGenerator<TVoiceTurnEvent> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        yield JSON.parse(data) as TVoiceTurnEvent;
      } catch {
        // Malformed frame — skip it rather than aborting the whole turn.
      }
    }
  }
}

/** Callbacks a turn consumer wires to its local UI/reducer state. */
interface TurnStreamHandlers {
  onText: (delta: string) => void;
  onTool: (name: string, summary: string) => void;
  onClarification: (question: string) => void;
  onProposal: (event: TVoiceProposal) => void;
  onReceipt: (outcome: string, code?: string) => void;
  onTurnError: (code: string) => void;
}

/** Drains `readTurnStream` into `handlers`, module scope (like `runRoomBurst`)
 *  so the `for await` stays out of the React-Compiler-compiled hook — the
 *  compiler cannot lower a for-await loop wherever it lives in the component
 *  tree, not only directly inside an effect. `isCurrent` lets the caller drop
 *  events from a turn a barge-in has already superseded. */
async function consumeTurnStream(
  res: Response,
  handlers: TurnStreamHandlers,
  isCurrent: () => boolean,
): Promise<void> {
  for await (const evt of readTurnStream(res)) {
    if (!isCurrent()) return;
    if (evt.type === "text") handlers.onText(evt.text);
    else if (evt.type === "tool") handlers.onTool(evt.name, evt.summary);
    else if (evt.type === "clarification") handlers.onClarification(evt.question);
    else if (evt.type === "proposal") handlers.onProposal(evt);
    else if (evt.type === "receipt") handlers.onReceipt(evt.outcome, evt.code);
    else if (evt.type === "error") handlers.onTurnError(evt.code);
  }
}

/** True RMS of the current time-domain buffer, in the same 0..1 amplitude
 *  scale `DEFAULT_VAD_CONFIG` (minFloor 0.005, margin 2.5x) was tuned
 *  against — NOT the byte-frequency loudness meter `recorder.ts`/
 *  `voice-entry.tsx` use for their visual level bars, which is a different
 *  scale entirely. */
function computeRms(analyser: AnalyserNode, buffer: Float32Array<ArrayBuffer>): number {
  analyser.getFloatTimeDomainData(buffer);
  let sumSquares = 0;
  for (let i = 0; i < buffer.length; i++) sumSquares += buffer[i] * buffer[i];
  return Math.sqrt(sumSquares / buffer.length);
}

/** POST `{hash}` to `.../confirm/` and map every outcome onto one `IReceipt`.
 *
 *  Module scope, like `readTurnStream`: it needs `try`/`catch` and never
 *  throws, and keeping it out of the compiled hook body keeps the hook free of
 *  control flow the React Compiler cannot lower.
 *
 *  409 is its own case, not a generic failure. It means the backend's pending
 *  proposal has moved on — superseded by a later turn, or past its
 *  confirmation TTL — so the honest thing to say is "ask the agent again",
 *  and there is deliberately no retry: re-POSTing this hash against a
 *  *different* pending proposal is precisely what hash-binding exists to stop.
 *  `recoverable_draft` is therefore set only on a transport failure, where
 *  nothing was decided and re-tapping is safe. */
async function postConfirm(
  baseUrl: string,
  workspaceSlug: string,
  sessionId: string,
  hash: string,
): Promise<IReceipt> {
  const failed = (detail: string, recoverable: boolean): IReceipt => ({
    outcome: "failed",
    action: "confirm",
    correlation_id: sessionId,
    detail,
    recoverable_draft: recoverable,
  });
  try {
    const res = await fetch(
      `${baseUrl}/workspaces/${workspaceSlug}/voice/sessions/${sessionId}/confirm/`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ hash }),
      },
    );
    if (res.status === 409) {
      return failed("That proposal is no longer current — ask the agent to repeat it.", false);
    }
    if (!res.ok) return failed("The change wasn't saved.", true);
    // ponytail: the wire's `result_code` is actually the tool's app-relative
    // deep link (`ToolResult.link`, e.g. `/{workspace}/projects/{id}/issues/{id}`)
    // — see gigsnano-api features/voice/turn.py `apply_proposal`, which builds
    // `Receipt(detail=result.summary, result_code=result.link)`. `detail` is the
    // human label ("Created WEB-42"); `result_code` is the href. Backend naming
    // is misleading but not ours to rename here — map onto `IReceipt`'s actual
    // shape (label + url) rather than propagating the confusion to the card.
    const body = (await res.json()) as {
      outcome: IReceipt["outcome"];
      action: string;
      result_code?: string;
      detail?: string;
      correlation_id: string;
    };
    return {
      outcome: body.outcome,
      action: body.action,
      result_code: body.detail || undefined,
      result_url: body.result_code || undefined,
      detail: body.detail,
      correlation_id: body.correlation_id || sessionId,
    };
  } catch {
    return failed("The change wasn't saved.", true);
  }
}

function browserSupportsVoice(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== "undefined" &&
    typeof window.AudioContext !== "undefined"
  );
}

function turnErrorCaption(code: string): string {
  if (code === "not_implemented") return "I can't make that change yet — coming soon.";
  return "Sorry, I couldn't finish that.";
}

export interface IUseVoiceCallResult {
  phase: EVoicePhase;
  /** The agent's in-flight reply sentence, shown muted until it commits to `finals`. */
  partial: string;
  finals: ITranscriptLine[];
  proposal: TVoiceProposal | null;
  toolChips: IToolChip[];
  /** Set once `getUserMedia` fails or the browser lacks Web Audio — the
   *  screen falls back to `<VoiceEntry>` + text chat when this is non-null. */
  micError: "denied" | "unsupported" | null;
  callActive: boolean;
  error: string;
  retryable: boolean;
  /** The outcome of the last confirmed proposal. A 409 from `/confirm/` lands
   *  here too, as a failed receipt saying the proposal is stale. */
  receipt: IReceipt | null;
  /** True while `/confirm/` is in flight, so the button can't be double-tapped. */
  confirming: boolean;
  start: () => void;
  hangUp: () => void;
  /** Applies the proposal the user just read, bound to its hash. */
  confirmProposal: (hash: string) => void;
  dismissProposal: () => void;
}

export function useVoiceCall({
  workspaceSlug,
  agent,
}: {
  workspaceSlug: string;
  agent: IAgent;
}): IUseVoiceCallResult {
  const { data: policy } = useVoicePolicy(workspaceSlug);
  const startSession = useStartVoiceSession(workspaceSlug);
  const endSession = useEndVoiceSession(workspaceSlug);
  const transcribe = useTranscribe(workspaceSlug);

  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [credential, setCredential] = useState<IVoiceCredential | null>(null);
  const [replyPartial, setReplyPartial] = useState("");
  const [toolChips, setToolChips] = useState<IToolChip[]>([]);
  const [proposal, setProposal] = useState<TVoiceProposal | null>(null);
  const [receipt, setReceipt] = useState<IReceipt | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [micError, setMicError] = useState<"denied" | "unsupported" | null>(null);

  const phaseRef = useRef(state.phase);
  useEffect(() => {
    phaseRef.current = state.phase;
  }, [state.phase]);

  const seqRef = useRef(0);
  const rafIdRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const queueRef = useRef<PlaybackQueue | null>(null);
  const recorderRef = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null);
  const turnAbortRef = useRef<AbortController | null>(null);
  /** Whether the active turn (see `turnRef`) has both finished streaming AND
   *  every sentence it queued has finished playing — the second half of the
   *  guard `checkTurnDrained` needs to know it is safe to return to
   *  Listening. Generation-scoped implicitly: it is only ever set `true`
   *  from code that already checked `isCurrentTurn`. */
  const turnAudioSettledRef = useRef(false);
  /** The turn-generation state (`lib/voice/turn-generation.ts`) — pure and
   *  unit-tested there. Interrupting a turn (Processing or Speaking, not just
   *  Speaking — see the file header) supersedes it so a `/speak/` response
   *  already in flight can never enqueue once it resolves. */
  const turnRef = useRef<ITurnGenState>(initialTurnGenState);

  // Lazily initialized (React docs' guarded pattern) rather than
  // `useRef(initVad())`, which would call `initVad()` — and throw the result
  // away — on every render.
  const vadStateRef = useRef<IVadState | null>(null);
  if (vadStateRef.current === null) vadStateRef.current = initVad();

  const emit = (type: EVoiceEvent, text = "", errorCode = "", retryable = false) => {
    seqRef.current += 1;
    dispatch({
      kind: "event",
      event: {
        version: 1,
        seq: seqRef.current,
        type,
        session_id: credential?.session_id ?? "",
        correlation_id: credential?.session_id ?? "",
        text,
        error_code: errorCode,
        retryable,
      },
    });
  };

  /** A terminal failure: say so AND stop the hardware.
   *
   *  Every `EVoiceEvent.Error` puts the reducer in `EVoicePhase.Error`, which
   *  renders as "Voice unavailable" — but on its own it left the rAF/VAD loop
   *  running, the microphone open, and every subsequent utterance still
   *  posting turns behind that label. A hot mic behind an "unavailable" pill
   *  is the worst state this screen can be in, so the teardown lives with the
   *  emit rather than at each of the six call sites that could forget it.
   *  Clearing the credential flips `callActive` off, which is what gives the
   *  user a Call button (and, when `retryable`, a Retry) instead of a dead end.
   *
   *  It also ends the server-side session, the same as `hangUp()` — starting a
   *  session revokes the actor's other sessions and spends the workspace's
   *  voice quota, so leaving it "live" server-side until `SESSION_TTL_MINUTES`
   *  expires means an immediate retry fights a session that never actually
   *  stopped. The credential is read (and `endSession` fired) *before* it's
   *  cleared below — end-then-forget, since local teardown already happened
   *  and matters more than this call's own outcome.
   *
   *  `teardownCall` is declared below; only referenced here at call time. */
  const fail = (code: string, retryable = true) => {
    emit(EVoiceEvent.Error, "", code, retryable);
    teardownCall();
    const sessionId = credential?.session_id;
    if (sessionId) {
      // Fire-and-forget: a failure here must never re-enter this same error
      // path, so its rejection is swallowed rather than surfaced.
      endSession.mutate(sessionId, { onError: () => undefined });
    }
    setCredential(null);
    // The session is gone, so its pending proposal can never be confirmed —
    // leaving the card up would offer a button that silently does nothing.
    setProposal(null);
  };

  /** POST one sentence to `/speak/` and return its audio, or null on any
   *  failure — a dropped sentence should not break the call. */
  const speak = async (sessionId: string, text: string): Promise<ArrayBuffer | null> => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/workspaces/${workspaceSlug}/voice/sessions/${sessionId}/speak/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ text, agent_id: agent.id }),
        },
      );
      return res.ok ? await res.arrayBuffer() : null;
    } catch {
      return null;
    }
  };

  const runTurn = async (sessionId: string, transcript: string) => {
    const { state: nextTurnState, gen } = startTurn(turnRef.current);
    turnRef.current = nextTurnState;
    const controller = new AbortController();
    turnAbortRef.current = controller;
    turnAudioSettledRef.current = false;
    setToolChips([]);
    setProposal(null);
    setReceipt(null);
    setReplyPartial("");

    let sentenceBuffer = "";
    const pendingSpeaks: Promise<void>[] = [];
    // Generation, not controller identity: a controller reference would only
    // tell us abort() was *called*, not stop a `/speak/` response that was
    // already in flight when it landed from enqueueing once it resolves.
    const isCurrent = () => isCurrentTurn(turnRef.current, gen);

    const flush = (raw: string) => {
      const sentence = raw.trim();
      setReplyPartial("");
      if (!sentence) return;
      emit(EVoiceEvent.TranscriptFinal, sentence);
      if (phaseRef.current !== EVoicePhase.Speaking) emit(EVoiceEvent.SynthesisStarted);
      pendingSpeaks.push(
        speak(sessionId, sentence).then((buf) => {
          // Dropped if a barge-in superseded this turn while /speak/ was in
          // flight — enqueueing it now would resume audio the user already
          // interrupted.
          if (buf && isCurrent()) queueRef.current?.enqueue(buf);
        }),
      );
    };

    try {
      const res = await fetch(
        `${API_BASE_URL}/workspaces/${workspaceSlug}/voice/sessions/${sessionId}/turn/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ transcript, agent_id: agent.id, project_id: agent.project_id }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        fail("turn_failed");
        turnRef.current = finishTurn(turnRef.current, gen);
        return;
      }

      await consumeTurnStream(
        res,
        {
          onText: (delta) => {
            sentenceBuffer += delta;
            setReplyPartial(sentenceBuffer);
            if (SENTENCE_END.test(sentenceBuffer)) {
              flush(sentenceBuffer);
              sentenceBuffer = "";
            }
          },
          onTool: (name, summary) =>
            setToolChips((prev) => [...prev, { id: `${prev.length}-${name}`, name, summary }]),
          onClarification: (question) => emit(EVoiceEvent.TranscriptFinal, question),
          onProposal: (event) => setProposal(event),
          onReceipt: (outcome, code) =>
            emit(EVoiceEvent.TranscriptFinal, `${outcome}${code ? ` — ${code}` : ""}`),
          // A turn-level error means the agent understood the request but
          // couldn't complete it (e.g. writes aren't wired yet —
          // "not_implemented"). The call itself is healthy, so this is a
          // caption, not the reducer's EVoiceEvent.Error (which ends the
          // whole session) — that stays reserved for real transport failures.
          onTurnError: (code) => emit(EVoiceEvent.TranscriptFinal, turnErrorCaption(code)),
        },
        isCurrent,
      );
      if (sentenceBuffer.trim()) flush(sentenceBuffer);
    } catch (err) {
      if ((err as Error).name !== "AbortError") fail("turn_stream_failed");
      turnRef.current = finishTurn(turnRef.current, gen);
      return;
    }

    await Promise.allSettled(pendingSpeaks);
    if (isCurrent()) turnAudioSettledRef.current = true;
  };

  /** Apply the proposal the user just read, bound to its hash.
   *
   *  The hash is the whole point of the contract: it goes to `/confirm/`
   *  exactly as it was rendered, so the thing approved and the thing executed
   *  are the same object. A 409 means the backend's pending proposal has moved
   *  on (superseded by a later turn, or aged past its TTL) — surfaced as a
   *  failed receipt telling the user to ask again, never retried silently,
   *  because a silent retry against a *different* pending proposal is exactly
   *  what the hash exists to prevent. */
  const confirmProposal = async (hash: string) => {
    const sessionId = credential?.session_id;
    if (!sessionId || confirming) return;
    setConfirming(true);
    const applied = await postConfirm(API_BASE_URL, workspaceSlug, sessionId, hash);
    setConfirming(false);
    setReceipt(applied);
    // A stale (409) or applied proposal is spent either way; only a transport
    // failure leaves it standing, since that one is genuinely worth re-tapping.
    if (applied.recoverable_draft !== true) setProposal(null);
  };

  const dismissProposal = () => setProposal(null);

  const handleSpeechStart = () => {
    if (recorderRef.current) return; // already capturing this utterance

    // A turn is in flight — still Processing (waiting on the SSE stream) or
    // already Speaking — and the user has started talking again. Scoping
    // this to `phase === Speaking` alone left a gap: interrupting during
    // Processing left the old turn's `/speak/` response free to enqueue and
    // start playing over the user's live microphone. Superseding it makes
    // every one of that turn's `isCurrentTurn` checks (in `runTurn`) false
    // from this point on, so its audio can never enqueue even if `/speak/`
    // was already in flight when abort() lands.
    if (turnRef.current.active !== null) {
      turnRef.current = supersedeActiveTurn(turnRef.current);
      turnAudioSettledRef.current = false;
      turnAbortRef.current?.abort();
      turnAbortRef.current = null;
      queueRef.current?.stop();
    }

    if (phaseRef.current === EVoicePhase.Speaking) {
      dispatch({ kind: "barge_in" });
    } else {
      dispatch({ kind: "press" });
    }

    const shared: ISharedAudioSource | undefined =
      streamRef.current && audioCtxRef.current
        ? { stream: streamRef.current, context: audioCtxRef.current }
        : undefined;
    startRecording(undefined, shared)
      .then((recorder) => {
        recorderRef.current = recorder;
      })
      .catch(() => fail("mic_failed"));
  };

  const handleSpeechEnd = async (sessionId: string) => {
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (!recorder) return;
    dispatch({ kind: "release" }); // capturing: false, phase: Processing

    const audio = await recorder.stop();
    let transcript = "";
    try {
      const result = await transcribe.mutateAsync({ sessionId, audio });
      transcript = result.transcript?.trim() ?? "";
      if (result.error && !transcript) {
        fail(result.error, result.retryable);
        return;
      }
    } catch {
      fail("transcribe_failed");
      return;
    }

    if (!transcript) {
      // Silence is a normal outcome, not a failure — back to Listening
      // without spending a turn (no POST /turn/, no wasted spend).
      dispatch({ kind: "press" });
      return;
    }

    emit(EVoiceEvent.TranscriptFinal, transcript);
    await runTurn(sessionId, transcript);
  };

  /** Runs every tick regardless of the VAD's own frame cadence: once a turn
   *  has finished streaming AND every sentence it queued has finished
   *  playing, hands the mic back — the only path that works whether the turn
   *  spoke ten sentences or announced a silent tool-only result with none. */
  const checkTurnDrained = () => {
    const queue = queueRef.current;
    const activeGen = turnRef.current.active;
    if (
      activeGen !== null &&
      turnAudioSettledRef.current &&
      queue &&
      !queue.isPlaying &&
      queue.pending === 0
    ) {
      turnRef.current = finishTurn(turnRef.current, activeGen);
      dispatch({ kind: "press" });
    }
  };

  const teardownCall = () => {
    if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    queueRef.current?.stop();
    queueRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
    void recorderRef.current?.stop().catch(() => undefined);
    recorderRef.current = null;
    turnAbortRef.current?.abort();
    turnAbortRef.current = null;
    turnRef.current = initialTurnGenState;
    turnAudioSettledRef.current = false;
  };

  // Purely an unmount safety net (empty deps — never re-runs): guarantees the
  // mic/graph/frame-loop are torn down if the user navigates away mid-call
  // without pressing Hang up. Mirrors `voice-entry.tsx`'s own unmount effect.
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) cancelAnimationFrame(rafIdRef.current);
      teardownCall();
    };
  }, []);

  const start = async () => {
    if (!browserSupportsVoice()) {
      setMicError("unsupported");
      return;
    }
    dispatch({ kind: "connect" });
    setMicError(null);

    let issued: IVoiceCredential;
    try {
      issued = await startSession.mutateAsync(policy?.locales?.[0] ?? "en-US");
    } catch {
      fail("session_start_failed");
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      // The session above is already open server-side — close it rather than
      // leaving an orphaned session running for a call that never captured
      // any audio.
      setMicError("denied");
      endSession.mutate(issued.session_id);
      return;
    }

    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const timeBuffer = new Float32Array(
      new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );

    streamRef.current = stream;
    audioCtxRef.current = ctx;
    queueRef.current = new PlaybackQueue(createAudioSink(ctx));
    vadStateRef.current = initVad();

    seqRef.current = 0;
    setCredential(issued);
    emit(EVoiceEvent.SessionStarted);

    let lastFrameTime = 0;
    const tick = (now: number) => {
      if (now - lastFrameTime >= DEFAULT_VAD_CONFIG.frameMs) {
        lastFrameTime = now;
        const rms = computeRms(analyser, timeBuffer);
        const vad = vadStateRef.current ?? initVad();
        const { state: nextVad, event } = pushFrame(vad, rms, DEFAULT_VAD_CONFIG);
        vadStateRef.current = nextVad;
        if (event === "speech_start") handleSpeechStart();
        else if (event === "speech_end") void handleSpeechEnd(issued.session_id);
      }
      checkTurnDrained();
      rafIdRef.current = requestAnimationFrame(tick);
    };
    rafIdRef.current = requestAnimationFrame(tick);
  };

  const hangUp = () => {
    const current = credential;
    teardownCall();
    setCredential(null);
    setProposal(null);
    setReceipt(null);
    dispatch({ kind: "end" });
    if (current) endSession.mutate(current.session_id);
  };

  return {
    phase: state.phase,
    partial: replyPartial,
    finals: state.finals,
    proposal,
    toolChips,
    micError,
    callActive: Boolean(credential),
    error: state.errorCode,
    retryable: state.retryable,
    receipt,
    confirming,
    start: () => void start(),
    hangUp,
    confirmProposal: (hash: string) => void confirmProposal(hash),
    dismissProposal,
  };
}
