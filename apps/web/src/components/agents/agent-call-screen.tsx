"use client";

/**
 * The hands-free call screen (Task 13, GIN-518) — clicking Call on an agent
 * contact now starts a real voice conversation instead of opening the text
 * chat `AgentDetail` used to mount.
 *
 * All the hard problems (VAD turn-taking, barge-in, sentence-at-a-time TTS
 * playback, the SSE turn contract) live in `useVoiceCall`; this component is
 * just phase → label, event → pixel.
 */

import { useState } from "react";
import Link from "next/link";
import { Call02Icon, CallEnd02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { AgentChat } from "@/components/agents/agent-chat";
import { VoiceEntry } from "@/components/voice/voice-entry";
import { MutationPreviewCard, ReceiptCard } from "@/components/voice/voice-cards";
import { useVoicePolicy } from "@/hooks/voice/use-voice";
import { useAgent } from "@/hooks/agents/use-agents";
import { useVoiceCall } from "@/hooks/voice/use-voice-call";
import { cn } from "@/lib/utils";
import { EVoicePhase, type IMutationProposal } from "@/types/voice";

const PHASE_LABEL: Record<EVoicePhase, string> = {
  [EVoicePhase.Idle]: "Ready to call",
  [EVoicePhase.Connecting]: "Connecting…",
  [EVoicePhase.Listening]: "Listening…",
  [EVoicePhase.Processing]: "Thinking…",
  [EVoicePhase.Speaking]: "Speaking…",
  [EVoicePhase.Paused]: "Paused",
  [EVoicePhase.Reconnecting]: "Reconnecting…",
  [EVoicePhase.Error]: "Voice unavailable",
};

/** Terminal failure codes `useVoiceCall` emits, in the user's terms. Anything
 *  unmapped falls back to a generic line — a raw code on screen is a support
 *  ticket, not an explanation. */
const ERROR_COPY: Record<string, string> = {
  session_start_failed: "Couldn't start the call. Check your connection and try again.",
  mic_failed: "Lost access to the microphone mid-call.",
  transcribe_failed: "Couldn't make out that last bit — the call has ended.",
  turn_failed: "The agent couldn't answer that one, so the call has ended.",
  turn_stream_failed: "The connection to the agent dropped.",
};

export function AgentCallScreen({
  workspaceSlug,
  agentId,
}: {
  workspaceSlug: string;
  agentId: string;
}) {
  const { data: agent, isPending, isError } = useAgent(workspaceSlug, agentId);
  const { data: policy } = useVoicePolicy(workspaceSlug);

  if (isPending) {
    return <div className="m-6 h-64 animate-pulse rounded-lg border bg-muted" />;
  }

  if (isError || !agent) {
    return (
      <div className="p-6">
        <EmptyState
          assetKey="error"
          title="Agent not found"
          description="This agent isn't in the workspace roster."
          actions={[{ label: "All agents", href: `/${workspaceSlug}/agents` }]}
        />
      </div>
    );
  }

  return (
    <CallBody
      workspaceSlug={workspaceSlug}
      agent={agent}
      policyEnabled={policy?.enabled}
      policyReason={policy?.reason}
    />
  );
}

function CallBody({
  workspaceSlug,
  agent,
  policyEnabled,
  policyReason,
}: {
  workspaceSlug: string;
  agent: NonNullable<ReturnType<typeof useAgent>["data"]>;
  policyEnabled: boolean | undefined;
  policyReason: string | undefined;
}) {
  const call = useVoiceCall({ workspaceSlug, agent });
  const disabled = policyEnabled === false;
  // Local presentation state only — useVoiceCall owns the real session
  // lifecycle. This just remembers "a call happened and was hung up" so the
  // idle view can tell a fresh contact from one you just finished talking to,
  // and offer a way back to the roster instead of a blank transcript.
  const [ended, setEnded] = useState(false);

  const handleStart = () => {
    setEnded(false);
    call.start();
  };
  const handleHangUp = () => {
    call.hangUp();
    setEnded(true);
  };

  return (
    <div className="mx-auto flex h-full max-w-xl flex-col p-6">
      <p className="text-xs text-muted-foreground">
        <Link href={`/${workspaceSlug}/agents`} className="hover:text-foreground">
          Agents
        </Link>
      </p>

      <header className="mt-4 flex flex-col items-center gap-2 text-center">
        <span
          aria-hidden
          className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-semibold text-white"
          style={{ backgroundColor: agent.avatar_color }}
        >
          {agent.name.slice(0, 1).toUpperCase()}
        </span>
        <h1 className="text-lg font-semibold">{agent.name}</h1>
        <p className="text-sm text-muted-foreground">{agent.persona}</p>
        <span
          role="status"
          aria-live="polite"
          className={cn(
            "mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors duration-200 ease-[var(--ease-out)]",
            call.phase === EVoicePhase.Speaking || call.phase === EVoicePhase.Listening
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground",
          )}
        >
          <span
            aria-hidden
            className={cn(
              "size-1.5 rounded-full bg-current",
              call.callActive && "animate-pulse",
            )}
          />
          {/* Keyed remount replays the .t-detail-swap @starting-style entry
              (same idiom as the inbox detail pane) so the label crossfades
              instead of snapping on every phase change. */}
          <span key={call.phase} className="t-detail-swap">
            {PHASE_LABEL[call.phase]}
          </span>
        </span>
      </header>

      {call.micError ? (
        <div className="mt-6 flex flex-1 flex-col gap-4">
          <VoiceEntry
            workspaceName={workspaceSlug}
            projectName={agent.name}
            enabled={!disabled}
            disabledReason={policyReason}
            onStart={() => call.start()}
          />
          <p className="text-center text-xs text-muted-foreground">
            {call.micError === "denied"
              ? "Microphone access was blocked — text chat still works below."
              : "This browser doesn't support voice calls — text chat still works below."}
          </p>
          <div className="min-h-0 flex-1">
            <AgentChat agent={agent} />
          </div>
        </div>
      ) : (
        <>
          {disabled ? (
            <div className="mt-6 flex-1">
              <EmptyState
                assetKey="generic"
                title="Voice is off for this workspace"
                description={policyReason || "An admin has turned off voice for this workspace."}
                actions={[
                  { label: "Open voice settings", href: `/${workspaceSlug}/settings/voice` },
                ]}
              />
            </div>
          ) : ended && !call.callActive ? (
            <div className="mt-6 flex-1">
              <EmptyState
                assetKey="generic"
                title="Call ended"
                description={`Your conversation with ${agent.name} has ended.`}
                actions={[{ label: "Back to agents", href: `/${workspaceSlug}/agents` }]}
              />
            </div>
          ) : (
            <>
              <div
                role="log"
                aria-live="polite"
                className="mt-6 min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border bg-card p-3 text-sm"
              >
                {call.finals.length === 0 && !call.partial ? (
                  <p className="text-center text-xs text-muted-foreground">
                    {call.callActive ? "Say something to get started." : "Press Call to start talking."}
                  </p>
                ) : null}
                {call.finals.map((line) => (
                  <p key={line.id} className="rounded-md px-2 py-1">
                    {line.text}
                  </p>
                ))}
                {call.partial ? (
                  <p className="rounded-md px-2 py-1 italic text-muted-foreground">{call.partial}</p>
                ) : null}
              </div>

              {call.toolChips.length > 0 ? (
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {call.toolChips.map((chip) => (
                    <li
                      key={chip.id}
                      className="rounded-full border bg-muted/60 px-2.5 py-1 text-xs text-muted-foreground"
                    >
                      {chip.summary || chip.name}
                    </li>
                  ))}
                </ul>
              ) : null}

              {/* Click-to-confirm only. A spoken "yes" has nothing to bind to;
                  this card carries the hash the backend matches against, so
                  what was read back and what gets written are one object. */}
              {call.proposal ? (
                <div className="mt-2">
                  <MutationPreviewCard
                    proposal={{
                      action: call.proposal.action as IMutationProposal["action"],
                      hash: call.proposal.hash,
                      target_code: call.proposal.target_code,
                      fields: call.proposal.fields,
                    }}
                    onConfirm={call.confirmProposal}
                    onCancel={call.dismissProposal}
                    busy={call.confirming}
                  />
                </div>
              ) : null}

              {call.receipt ? (
                <div className="mt-2">
                  <ReceiptCard receipt={call.receipt} />
                </div>
              ) : null}
            </>
          )}

          {/* A mid-call failure now really is over — useVoiceCall has closed the
              mic and the session — so the only honest thing to show is what
              broke and, when it's worth another go, a way to try again. */}
          {call.error && !call.callActive ? (
            <div
              role="alert"
              className="mt-4 rounded-lg border border-destructive/40 bg-card p-3 text-sm"
            >
              <p>{ERROR_COPY[call.error] ?? "Something went wrong on this call."}</p>
              {call.retryable ? (
                <Button type="button" size="sm" className="mt-2" onClick={handleStart}>
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}

          <div className="mt-4 flex justify-center">
            {call.callActive ? (
              <Button
                type="button"
                size="lg"
                variant="destructive"
                aria-label="Hang up"
                onClick={handleHangUp}
                className="gap-2 rounded-full px-8"
              >
                <HugeiconsIcon icon={CallEnd02Icon} className="size-4" />
                Hang up
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                aria-label={disabled ? (policyReason || "Voice is off for this workspace") : "Call"}
                disabled={disabled}
                onClick={handleStart}
                className="gap-2 rounded-full px-8"
              >
                <HugeiconsIcon icon={Call02Icon} className="size-4" />
                Call
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
