"use client";

/**
 * Live voice session: state, captions, interruption controls (GIN-504).
 *
 * The status pill and the caption are driven from `isListening(state)`, never
 * from the phase alone — a UI that says "Listening" while capture has stopped is
 * the single most damaging bug this screen can have, because a user trusts it
 * and keeps talking.
 *
 * Controls stay pinned while the transcript scrolls: reaching for Stop should
 * never require finding it first.
 */

import { useEffect, useRef, useState } from "react";
import {
  Cancel01Icon,
  Mic01Icon,
  MicOff01Icon,
  PauseIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { announcement, isListening, type IVoiceState } from "@/lib/voice/session-machine";
import { cn } from "@/lib/utils";
import { EVoicePhase } from "@/types/voice";

interface VoiceSessionPanelProps {
  state: IVoiceState;
  onPress: () => void;
  onRelease: () => void;
  onToggleMute: () => void;
  onCancelTurn: () => void;
  onEnd: () => void;
  onEditFinal: (index: number, text: string) => void;
  onKeyboardHandoff: () => void;
}

const PHASE_TONE: Record<EVoicePhase, string> = {
  [EVoicePhase.Idle]: "bg-muted text-muted-foreground",
  [EVoicePhase.Connecting]: "bg-muted text-muted-foreground",
  [EVoicePhase.Listening]: "bg-primary/10 text-primary",
  [EVoicePhase.Processing]: "bg-muted text-muted-foreground",
  [EVoicePhase.Speaking]: "bg-primary/10 text-primary",
  [EVoicePhase.Paused]: "bg-muted text-muted-foreground",
  [EVoicePhase.Reconnecting]: "bg-muted text-muted-foreground",
  [EVoicePhase.Error]: "bg-destructive/10 text-destructive",
};

export function VoiceSessionPanel({
  state,
  onPress,
  onRelease,
  onToggleMute,
  onCancelTurn,
  onEnd,
  onEditFinal,
  onKeyboardHandoff,
}: VoiceSessionPanelProps) {
  const listening = isListening(state);
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const tailRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tailRef.current?.scrollIntoView({ block: "end" });
  }, [state.finals.length, state.partial]);

  return (
    <section
      aria-label="Voice session"
      className="flex h-full flex-col rounded-xl border bg-card text-card-foreground"
    >
      <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
            PHASE_TONE[state.phase],
          )}
        >
          {/* A non-audio cue, and one that does not rely on colour alone. */}
          <span
            aria-hidden
            className={cn("gn-voice-dot size-1.5 rounded-full bg-current", listening && "is-live")}
          />
          {announcement(state) || "Ready"}
        </span>

        <Button type="button" variant="ghost" size="sm" onClick={onEnd}>
          End
        </Button>
      </header>

      {/* Politeness matters: state changes should not interrupt what a screen
          reader is already reading out of the transcript. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement(state)}
      </p>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-3 text-sm">
        {state.finals.map((line, index) =>
          editing === index ? (
            <form
              key={line.id}
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                onEditFinal(index, draft);
                setEditing(null);
              }}
            >
              <label htmlFor={`gn-final-${index}`} className="sr-only">
                Correct transcript line {index + 1}
              </label>
              <input
                id={`gn-final-${index}`}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="h-8 flex-1 rounded-md border bg-background px-2"
              />
              <Button type="submit" size="icon" variant="ghost" aria-label="Save correction">
                <HugeiconsIcon icon={Tick02Icon} className="size-4" />
              </Button>
            </form>
          ) : (
            /* Editable before it can back a mutation preview — a mis-heard title
               must be fixable without re-dictating the whole request. */
            <button
              key={line.id}
              type="button"
              onClick={() => {
                setEditing(index);
                setDraft(line.text);
              }}
              className="block w-full rounded-md px-2 py-1 text-left hover:bg-muted"
            >
              {line.text}
              <span className="sr-only"> — edit this line</span>
            </button>
          ),
        )}

        {state.partial ? (
          /* Visibly provisional: a partial is a guess, and styling it like a
             committed line invites the user to react to words they never said. */
          <p className="px-2 py-1 italic text-muted-foreground">{state.partial}</p>
        ) : null}

        {state.phase === EVoicePhase.Error ? (
          <p role="alert" className="rounded-md bg-destructive/10 px-2 py-1.5 text-destructive">
            Voice stopped ({state.errorCode}). Text chat still works.{" "}
            <button type="button" onClick={onKeyboardHandoff} className="underline">
              Switch to keyboard
            </button>
          </p>
        ) : null}

        <div ref={tailRef} />
      </div>

      <footer className="sticky bottom-0 flex items-center gap-2 border-t bg-card px-3 py-2">
        <Button
          type="button"
          className="gn-voice-ptt flex-1"
          aria-pressed={listening}
          aria-label={listening ? "Release to stop talking" : "Hold to talk"}
          onPointerDown={onPress}
          onPointerUp={onRelease}
          onPointerLeave={onRelease}
          // Keyboard parity: space/enter hold the mic the same way a pointer does.
          onKeyDown={(e) => {
            if (e.key === " " || e.key === "Enter") onPress();
          }}
          onKeyUp={(e) => {
            if (e.key === " " || e.key === "Enter") onRelease();
          }}
        >
          <HugeiconsIcon icon={Mic01Icon} className="size-4" />
          {listening ? "Listening — release to send" : "Hold to talk"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={state.muted ? "Unmute microphone" : "Mute microphone"}
          aria-pressed={state.muted}
          onClick={onToggleMute}
        >
          <HugeiconsIcon icon={state.muted ? MicOff01Icon : Mic01Icon} className="size-4" />
        </Button>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Cancel this turn"
          onClick={onCancelTurn}
        >
          <HugeiconsIcon
            icon={state.phase === EVoicePhase.Speaking ? PauseIcon : Cancel01Icon}
            className="size-4"
          />
        </Button>
      </footer>
    </section>
  );
}
