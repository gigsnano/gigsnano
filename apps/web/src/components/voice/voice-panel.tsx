"use client";

/**
 * The one place voice is actually wired end to end (GIN-491).
 *
 * Owns the whole loop: ask the server whether voice is allowed → start a session
 * → hold to record → stop, encode, upload → render the transcript. Everything it
 * composes was already built and tested in isolation; this is the seam that made
 * them a feature instead of a library.
 *
 * The microphone is offered only when the *server* says so. `useVoicePolicy`
 * answers from the workspace allowlist and the kill switch, so a client cannot
 * enable itself, and every refusal carries a reason the user can read.
 */

import { useEffect, useReducer, useRef, useState } from "react";

import { VoiceEntry } from "@/components/voice/voice-entry";
import { VoiceSessionPanel } from "@/components/voice/voice-session-panel";
import {
  useEndVoiceSession,
  useStartVoiceSession,
  useTranscribe,
  useVoicePolicy,
} from "@/hooks/voice/use-voice";
import { startRecording, type IRecorder } from "@/lib/voice/recorder";
import { initialVoiceState, voiceReducer } from "@/lib/voice/session-machine";
import { EVoiceEvent, EVoicePhase, type IVoiceCredential } from "@/types/voice";

interface VoicePanelProps {
  workspaceSlug: string;
  projectName?: string;
}

export function VoicePanel({ workspaceSlug, projectName }: VoicePanelProps) {
  const { data: policy } = useVoicePolicy(workspaceSlug);
  const startSession = useStartVoiceSession(workspaceSlug);
  const endSession = useEndVoiceSession(workspaceSlug);
  const transcribe = useTranscribe(workspaceSlug);

  const [state, dispatch] = useReducer(voiceReducer, initialVoiceState);
  const [credential, setCredential] = useState<IVoiceCredential | null>(null);
  const recorderRef = useRef<IRecorder | null>(null);
  const seqRef = useRef(0);

  // Releasing the microphone on unmount is not optional: a live track keeps the
  // browser's recording indicator lit, which reads as the app still listening.
  useEffect(
    () => () => {
      void recorderRef.current?.stop();
      recorderRef.current = null;
    },
    [],
  );

  /** Feed the reducer a canonical event, so the UI path is identical to the
   *  streaming one it will use when a streaming adapter lands. */
  const emit = (type: EVoiceEvent, text = "", errorCode = "") => {
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
        retryable: Boolean(errorCode),
      },
    });
  };

  const begin = async (deviceId: string) => {
    dispatch({ kind: "connect" });
    try {
      const issued = await startSession.mutateAsync(policy?.locales?.[0] ?? "en-US");
      setCredential(issued);
      seqRef.current = 0;
      emit(EVoiceEvent.SessionStarted);
      recorderRef.current = await startRecording(deviceId);
    } catch {
      emit(EVoiceEvent.Error, "", "session_start_failed");
    }
  };

  const press = () => {
    if (recorderRef.current) dispatch({ kind: "press" });
  };

  const release = async () => {
    const recorder = recorderRef.current;
    if (!recorder || !credential || !state.capturing) return;
    dispatch({ kind: "release" });

    const audio = await recorder.stop();
    recorderRef.current = null;
    try {
      const result = await transcribe.mutateAsync({
        sessionId: credential.session_id,
        audio,
      });
      if (result.error) {
        emit(EVoiceEvent.Error, "", result.error);
      } else if (result.transcript) {
        emit(EVoiceEvent.TranscriptFinal, result.transcript);
        emit(EVoiceEvent.TurnEnded);
      } else {
        // Silence is a normal outcome, not a failure — end the turn quietly
        // rather than showing an error the user did not cause.
        emit(EVoiceEvent.TurnEnded);
      }
    } catch {
      emit(EVoiceEvent.Error, "", "transcribe_failed");
    }
    // Re-arm so the next press records immediately rather than after a round-trip.
    recorderRef.current = await startRecording().catch(() => null);
  };

  const finish = async () => {
    void recorderRef.current?.stop();
    recorderRef.current = null;
    if (credential) await endSession.mutateAsync(credential.session_id).catch(() => undefined);
    setCredential(null);
    dispatch({ kind: "end" });
  };

  if (!credential || state.phase === EVoicePhase.Idle) {
    return (
      <VoiceEntry
        workspaceName={workspaceSlug}
        projectName={projectName}
        enabled={Boolean(policy?.enabled)}
        disabledReason={policy?.reason}
        onStart={(deviceId) => void begin(deviceId)}
      />
    );
  }

  return (
    <VoiceSessionPanel
      state={state}
      onPress={press}
      onRelease={() => void release()}
      onToggleMute={() => dispatch({ kind: "mute", on: !state.muted })}
      onCancelTurn={() => dispatch({ kind: "cancelTurn" })}
      onEnd={() => void finish()}
      onEditFinal={(index, text) => dispatch({ kind: "editFinal", index, text })}
      onKeyboardHandoff={() => void finish()}
    />
  );
}
