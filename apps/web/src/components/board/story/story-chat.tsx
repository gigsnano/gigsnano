"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import type { UIMessage } from "ai";

import { Button } from "@/components/ui/button";
import { ChatPaymentNotice } from "@/components/billing/chat-payment-notice";
import { ChatUsageStrip } from "@/components/billing/chat-usage-strip";
import { EstimateHint, bmadWorkflowToOperation } from "@/components/billing/estimate-hint";
import { StoryChatComposer } from "@/components/ai/story-chat-composer";
import {
  isLockedThreadError,
  isNonLlmThreadError,
  useFinalizeDescription,
  useFinalizeThread,
  useOpenThread,
} from "@/hooks/docs/use-thread";
import { queryKeys } from "@/hooks/query-keys";
import { useToolEvents } from "@/hooks/ai/use-tool-events";
import { createStoryChatTransport } from "@/lib/chat/chat-transport";
import { htmlHasContent } from "@/lib/chat/description-finalize";
import { OverwriteDescriptionDialog } from "@/components/issues/detail/dialogs/overwrite-description-dialog";
import { APIError } from "@/services/api-error";
import { threadService } from "@/services/docs/thread.service";
import { EThreadState, isFinalizedThreadState, type IDocument, type IStory, type IThreadOut } from "@/types";
import { resolveStoryAgentId } from "@/lib/ai/story-agent-id";
import { cn } from "@/lib/utils";
import { BmadResponseParts } from "@/components/ai/chat/bmad-response";
import { CitationProvider } from "@/components/ai/chat/citation-context";
import { ChatSessionProvider } from "@/components/ai/chat/chat-session-context";
import { ToolEventsProvider } from "@/components/ai/chat/tool-events-context";
import { MessageToolEvents } from "@/components/ai/chat/tool-event-timeline";
import { ScrollToLatest } from "@/components/ai/chat/scroll-to-latest";

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-muted px-3 py-2 text-sm leading-relaxed text-foreground">
        <MessageToolEvents />
        <MessagePrimitive.Parts components={{ Text: BmadResponseParts }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function buildInitialMessages(story: IStory, thread: IThreadOut, mode?: "break-down"): UIMessage[] {
  if (thread.messages.length > 0) {
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
    }));
  }
  const agent =
    mode === "break-down" ? "Product Manager" : (story.bmad?.agent ?? "your assistant");
  const intro =
    mode === "break-down"
      ? `Hi! I'm your ${agent}. Let's break down "${story.title}" into stories and tasks. I'll read the epic description and propose a tree for your approval.`
      : `Hi! I'm your ${agent}. Let's tackle "${story.title}". ${story.description}`;
  return [
    {
      id: "greeting",
      role: "assistant",
      parts: [{ type: "text", text: intro }],
    },
  ];
}

function readSessionState(data: unknown): string | undefined {
  if (typeof data === "string") return data;
  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>;
    if (typeof obj.state === "string") return obj.state;
    if (typeof obj.session_state === "string") return obj.session_state;
  }
  return undefined;
}

function StoryChatSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <div className="h-16 w-4/5 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
      <div className="ml-auto h-10 w-3/5 animate-pulse rounded-2xl rounded-br-sm bg-muted" />
      <div className="h-12 w-2/3 animate-pulse rounded-2xl rounded-bl-sm bg-muted" />
    </div>
  );
}

function StoryChatConversation({
  story,
  thread,
  workspaceSlug,
  projectId,
  storyDocuments,
  referencedDocIds,
  onReferencedDocIdsChange,
  projectDocuments,
  mentionDocuments,
  mode,
  onBreakDownComplete,
}: {
  story: IStory;
  thread: IThreadOut;
  workspaceSlug: string;
  projectId: string;
  storyDocuments: IDocument[];
  referencedDocIds: string[];
  onReferencedDocIdsChange: (ids: string[]) => void;
  projectDocuments?: IDocument[];
  mentionDocuments?: IDocument[];
  mode?: "break-down";
  onBreakDownComplete?: () => void;
}) {
  const [sessionState, setSessionState] = useAdjustedState(thread.state);
  const finalize = useFinalizeThread(workspaceSlug, projectId, story.id);
  const finalizeDescription = useFinalizeDescription(workspaceSlug, projectId, story.id);
  const queryClient = useQueryClient();
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [paymentBlocked, setPaymentBlocked] = useState(false);
  const toolEvents = useToolEvents();
  const agentName = mode === "break-down" ? "Product Manager" : (story.bmad?.agent ?? "The agent");
  const isBreakDown = mode === "break-down";

  const runDescription = () => {
    finalizeDescription.mutate(undefined, {
      onSuccess: () => setConfirmOverwrite(false),
      // No toast in this app — the invalidated story query re-renders the
      // description block, which is the success signal.
    });
  };

  const onGenerateDescription = () => {
    if (htmlHasContent(story.description ?? "")) setConfirmOverwrite(true);
    else runDescription();
  };

  const referencedDocs = storyDocuments.filter((d) => referencedDocIds.includes(d.id));

  const transport = createStoryChatTransport(
    threadService.messagesUrl(workspaceSlug, projectId, story.id),
    () => setPaymentBlocked(true),
  );
  const initialMessages = buildInitialMessages(story, thread, mode);

  const runtime = useChatRuntime({
    transport,
    messages: initialMessages,
    onData: (part) => {
      toolEvents.onData(part);
      if (part.type === "data-session") {
        const next = readSessionState(part.data);
        if (next) setSessionState(next);
      }
      // Real backend may emit a terminal usage frame; either way, refetch the
      // aggregate so the receipt strip updates after the turn (never mid-stream).
      if (part.type === "data-usage" || part.type === "data-session") {
        queryClient.invalidateQueries({
          queryKey: queryKeys.aiThreadUsage(workspaceSlug, projectId, story.id, thread.id),
        });
      }
    },
    // GIN-478: a tool only leaves "running" when its result arrives, so a turn
    // that ends without one (backend crash, dropped SSE) would spin forever.
    onFinish: () => toolEvents.settle(),
    onError: () => toolEvents.settle(),
  });

  const isReadyToFinalize = sessionState === EThreadState.ReadyToFinalize;
  // Once finalized, the backend 409s every send — swap the composer for a notice
  // so a stray "Generate" click can't leave the chat spinning on a dead turn.
  const isFinalized = isFinalizedThreadState(sessionState);
  const artifactLabel = isBreakDown ? "stories & tasks" : (story.bmad?.artifact ?? "the document");
  const finalizeError = finalize.error instanceof APIError ? finalize.error : null;
  const finalizeDescriptionError =
    finalizeDescription.error instanceof APIError ? finalizeDescription.error : null;
  const estimateOperation = isBreakDown
    ? bmadWorkflowToOperation("epics")
    : bmadWorkflowToOperation(story.bmad?.workflow);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ToolEventsProvider value={{ events: toolEvents.events, setStatus: toolEvents.setStatus }}>
      <CitationProvider workspaceSlug={workspaceSlug} projectId={projectId}>
      <ChatSessionProvider isFinalized={isFinalized}>
      <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
        {/* The pill anchors to the MESSAGE viewport, not the column — `relative` on
            the Root would put it on top of the composer below (GIN-476). */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-5">
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ThreadPrimitive.Viewport>
          <ScrollToLatest />
        </div>
        <div className="shrink-0 space-y-2 border-t p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <ChatUsageStrip
                slug={workspaceSlug}
                projectId={projectId}
                storyId={story.id}
                threadId={thread.id}
              />
            </div>
            {!isFinalized ? (
              <>
            <Button
              type="button"
              size="sm"
              variant={isReadyToFinalize ? "default" : "outline"}
              className={cn(
                "shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]",
                isReadyToFinalize && "ring-2 ring-primary/50",
              )}
              disabled={finalize.isPending}
              onClick={() =>
                finalize.mutate(undefined, {
                  onSuccess: () => {
                    if (isBreakDown) onBreakDownComplete?.();
                  },
                })
              }
            >
              {finalize.isPending ? "Generating…" : isBreakDown ? "Create stories & tasks" : `Generate ${artifactLabel}`}
            </Button>
            {!isBreakDown ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 transition-transform duration-150 ease-out active:scale-[0.97]"
              disabled={finalizeDescription.isPending}
              onClick={onGenerateDescription}
            >
              {finalizeDescription.isPending ? (
                <span className="flex items-center gap-1.5">
                  <span className="size-3 animate-spin rounded-full border-[1.5px] border-current border-t-transparent" />
                  Generating…
                </span>
              ) : (
                "Generate description"
              )}
            </Button>
            ) : null}
              </>
            ) : null}
          </div>
          {isFinalized ? (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-center">
              <p className="text-sm font-medium text-foreground">This step is finalized</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                The {artifactLabel} was generated — open the task detail to review it, or mark
                the step complete. The agent chat is closed for this step.
              </p>
            </div>
          ) : (
            <>
          <EstimateHint operation={estimateOperation} workspaceSlug={workspaceSlug} />
          {isReadyToFinalize ? (
            <p className="text-xs font-medium text-primary">
              The agent is ready to generate {artifactLabel}.
            </p>
          ) : null}
          {finalizeError ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <span>
                {finalizeError.status === 409
                  ? isBreakDown
                    ? "This epic already has sub-work items."
                    : "The thread is busy or already completed."
                  : "Couldn't generate the document. Try again."}
              </span>
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={() => finalize.mutate()}
              >
                Retry
              </button>
            </div>
          ) : null}
          {finalizeDescriptionError ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-2.5 py-1.5 text-xs text-destructive">
              <span>
                {finalizeDescriptionError.status === 409
                  ? "The thread is busy or already completed."
                  : "Couldn't generate the description. Try again."}
              </span>
              <button
                type="button"
                className="font-medium underline underline-offset-2"
                onClick={onGenerateDescription}
              >
                Retry
              </button>
            </div>
          ) : null}
          {finalizeDescription.isSuccess && !finalizeDescription.isPending ? (
            <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
              Description updated — open the task detail to review it.
            </p>
          ) : null}
          {paymentBlocked ? <ChatPaymentNotice workspaceSlug={workspaceSlug} /> : null}
          <OverwriteDescriptionDialog
            open={confirmOverwrite}
            agentName={agentName}
            pending={finalizeDescription.isPending}
            onConfirm={runDescription}
            onOpenChange={setConfirmOverwrite}
          />
          <StoryChatComposer
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            referencedDocs={referencedDocs}
            onReferencedDocsChange={(docs) => onReferencedDocIdsChange(docs.map((d) => d.id))}
            mentionDocuments={mentionDocuments ?? projectDocuments}
            agentId={resolveStoryAgentId(story, mode)}
          />
            </>
          )}
        </div>
      </ThreadPrimitive.Root>
      </ChatSessionProvider>
      </CitationProvider>
      </ToolEventsProvider>
    </AssistantRuntimeProvider>
  );
}

export function StoryChat({
  story,
  workspaceSlug,
  projectId,
  storyDocuments: storyDocumentsProp,
  referencedDocIds: referencedDocIdsProp,
  onReferencedDocIdsChange,
  projectDocuments: projectDocumentsProp,
  scopedStories: scopedStoriesProp,
  workflowOverride,
  mode,
  onBreakDownComplete,
}: {
  story: IStory;
  workspaceSlug: string;
  projectId: string;
  storyDocuments?: IDocument[];
  referencedDocIds?: string[];
  onReferencedDocIdsChange?: (ids: string[]) => void;
  /** Contractor route: project docs from contract-scoped API instead of workspace list. */
  projectDocuments?: IDocument[];
  /** Contractor route: sprint/cycle stories from contract-scoped API. */
  scopedStories?: IStory[];
  workflowOverride?: string;
  mode?: "break-down";
  onBreakDownComplete?: () => void;
}) {
  const threadQuery = useOpenThread(workspaceSlug, projectId, story.id, {
    workflow: workflowOverride,
  });
  const [localRefIds, setLocalRefIds] = useState<string[]>([]);

  const referencedDocIds = referencedDocIdsProp ?? localRefIds;
  const setReferencedDocIds = onReferencedDocIdsChange ?? setLocalRefIds;
  const storyDocuments = storyDocumentsProp ?? [];

  if (threadQuery.isPending) {
    return <StoryChatSkeleton />;
  }

  if (threadQuery.isError) {
    if (isNonLlmThreadError(threadQuery.error)) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          This step doesn&apos;t use chat — mark it complete when you&apos;re ready.
        </div>
      );
    }
    if (isLockedThreadError(threadQuery.error)) {
      return (
        <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
          This step is locked until its prerequisite steps are complete.
        </div>
      );
    }
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground">
        <p>Couldn&apos;t open the agent thread.</p>
        <Button type="button" variant="outline" size="sm" onClick={() => threadQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <StoryChatConversation
      key={story.id}
      story={story}
      thread={threadQuery.data}
      workspaceSlug={workspaceSlug}
      projectId={projectId}
      storyDocuments={storyDocuments}
      referencedDocIds={referencedDocIds}
      onReferencedDocIdsChange={setReferencedDocIds}
      projectDocuments={projectDocumentsProp}
      mentionDocuments={projectDocumentsProp}
      mode={mode}
      onBreakDownComplete={onBreakDownComplete}
    />
  );
}
