"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AssistantRuntimeProvider,
  useComposerRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
} from "@assistant-ui/react";
import { useAISDKRuntime } from "@assistant-ui/react-ai-sdk";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  SentIcon,
  Add01Icon,
  AtIcon,
  Mic01Icon,
  File01Icon,
  Cancel01Icon,
  Layers01Icon,
} from "@hugeicons/core-free-icons";

import { AgentPicker } from "@/components/ai/composer/agent-picker";
import { VoicePanel } from "@/components/voice/voice-panel";
import { ComposerSlashMenu } from "@/components/ai/composer/composer-slash-menu";
import { EpicPickerDialog } from "@/components/ai/composer/epic-picker-dialog";
import { useComposerSlash } from "@/components/ai/composer/use-composer-slash";
import { ChatPaymentNotice } from "@/components/billing/chat-payment-notice";
import { ChatUsageStrip } from "@/components/billing/chat-usage-strip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGENT_COMMANDS, type IAgentCommand } from "@/constants/agent-commands";
import { filterAgentCommands } from "@/lib/ai/agent-command-filter";
import { issueDetailHref } from "@/lib/issues/issue-routes";
import { cn } from "@/lib/utils";
import { useProject } from "@/hooks/project/use-projects";
import { useDocuments } from "@/hooks/docs/use-documents";
import { queryKeys } from "@/hooks/query-keys";
import { useProjectStories } from "@/hooks/story/use-stories";
import { createGigsChatTransport } from "@/lib/chat/chat-transport";
import { readUploadFileContent } from "@/lib/docs/read-upload-file";
import { gigsAiService } from "@/services/ai/gigs-ai.service";
import { useGigsThread } from "@/hooks/ai/use-gigs-ai";
import { useToolEvents } from "@/hooks/ai/use-tool-events";
import { useGigsAiComposerStore } from "@/store/ui/gigs-ai-composer.store";
import { EStoryType, type IDocument, type IStory } from "@/types";
import type { IGigsChatSendExtras, IGigsInlineAttachment, IGigsThread } from "@/types/ai/gigs-ai";
import { GIGS_AI_SUGGESTIONS } from "./constants";
import { BmadResponseParts } from "@/components/ai/chat/bmad-response";
import { CitationProvider } from "@/components/ai/chat/citation-context";
import { StoryProposalProvider } from "@/components/ai/chat/story-proposal-context";
import { ToolEventsProvider } from "@/components/ai/chat/tool-events-context";
import { MessageToolEvents } from "@/components/ai/chat/tool-event-timeline";

function buildInitialMessages(thread: IGigsThread | undefined): UIMessage[] {
  if (thread && thread.messages.length > 0) {
    return thread.messages.map((m) => ({
      id: m.id,
      role: m.role,
      parts: [{ type: "text", text: m.content }],
    }));
  }
  return [
    {
      id: "greeting",
      role: "assistant",
      parts: [
        {
          type: "text",
          text: "Hi — I'm GigsAI. Pick an agent, type / for commands, or choose a suggestion below.",
        },
      ],
    },
  ];
}

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-end">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2.5 text-sm text-primary-foreground">
        <MessagePrimitive.Parts />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-sm border border-border/60 bg-muted px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
        <MessageToolEvents />
        <MessagePrimitive.Parts components={{ Text: BmadResponseParts }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function EmptyState() {
  return (
    <ThreadPrimitive.Empty>
      <div className="flex flex-1 flex-col justify-end gap-2 px-1 pb-2">
        <p className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Suggestions
        </p>
        {GIGS_AI_SUGGESTIONS.map((s) => (
          <ThreadPrimitive.Suggestion
            key={s}
            prompt={s}
            method="replace"
            autoSend
            className="group flex items-start gap-2 rounded-lg border bg-card px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent/50 active:scale-[0.99]"
          >
            <span className="mt-0.5 text-muted-foreground group-hover:text-foreground">↳</span>
            <span>{s}</span>
          </ThreadPrimitive.Suggestion>
        ))}
      </div>
    </ThreadPrimitive.Empty>
  );
}

function Composer({
  workspaceSlug,
  projectId,
  referencedDocs,
  onReferencedDocsChange,
  pendingAttachments,
  onPendingAttachmentsChange,
  onBeforeSend,
  onSend,
}: {
  workspaceSlug: string;
  projectId?: string;
  referencedDocs: IDocument[];
  onReferencedDocsChange: (docs: IDocument[]) => void;
  pendingAttachments: IGigsInlineAttachment[];
  onPendingAttachmentsChange: (attachments: IGigsInlineAttachment[]) => void;
  onBeforeSend: () => void;
  onSend: () => void;
}) {
  const router = useRouter();
  const composer = useComposerRuntime();
  const selectedAgentId = useGigsAiComposerStore((s) => s.selectedAgentId);
  const setSelectedAgentId = useGigsAiComposerStore((s) => s.setSelectedAgentId);
  const { data: project } = useProject(workspaceSlug, projectId ?? "");
  const { data: documents } = useDocuments(workspaceSlug);
  const { data: stories } = useProjectStories(workspaceSlug, projectId ?? "");
  const [epicPickerOpen, setEpicPickerOpen] = useState(false);
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const docs = (documents ?? []).filter((d) => !projectId || d.project_id === projectId);
  const epics = (stories ?? []).filter((s) => s.type === EStoryType.Epic);

  const syncCaret = () => {
    const el = inputRef.current;
    if (el) setCaret(el.selectionStart ?? 0);
  };

  const replaceText = (next: string, nextCaret: number) => {
    composer.setText(next);
    setText(next);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const slash = useComposerSlash({ text, caret, onReplace: replaceText });

  const filteredCommands = filterAgentCommands(AGENT_COMMANDS, {
    agentId: selectedAgentId,
    query: slash.trigger?.query,
  });

  const insert = (value: string) => {
    const cur = composer.getState().text;
    const next = (cur ? `${cur} ` : "") + value + " ";
    replaceText(next, next.length);
  };

  const insertMention = (doc: IDocument) => {
    insert(`@${doc.title}`);
    if (!referencedDocs.some((d) => d.id === doc.id)) {
      onReferencedDocsChange([...referencedDocs, doc]);
    }
  };

  const removeReference = (docId: string) => {
    onReferencedDocsChange(referencedDocs.filter((d) => d.id !== docId));
  };

  const removeAttachment = (index: number) => {
    onPendingAttachmentsChange(pendingAttachments.filter((_, idx) => idx !== index));
  };

  const runCommand = (command: IAgentCommand) => {
    if (command.action === "open-epic-breakdown") {
      slash.dismiss();
      if (projectId) {
        setEpicPickerOpen(true);
      }
      return;
    }
    const template = command.prompt_template ?? command.slash;
    slash.replaceWith(template);
  };

  const onEpicPicked = (epic: IStory) => {
    if (!projectId) return;
    const href = `${issueDetailHref(workspaceSlug, { id: epic.id, project_id: projectId, bmad: null })}?breakDown=1`;
    router.push(href);
  };

  const onComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slash.open && event.key === "Enter" && !event.shiftKey && filteredCommands.length) {
      event.preventDefault();
      runCommand(filteredCommands[slash.selected]!);
      return;
    }
    if (slash.onKeyDown(event, filteredCommands.length)) return;
    syncCaret();
  };

  return (
    <>
      <ComposerPrimitive.Root className="relative flex flex-col gap-2 rounded-xl border bg-background p-2 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50">
        {project ? (
          <div className="flex items-center gap-1.5 self-start rounded-md bg-muted px-2 py-1 text-xs font-medium text-foreground">
            <span aria-hidden>{project.logo_emoji ?? "📁"}</span>
            <span className="truncate">{project.name}</span>
          </div>
        ) : null}

        {referencedDocs.length > 0 || pendingAttachments.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {referencedDocs.map((doc) => (
              <span
                key={doc.id}
                className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-1 text-xs text-foreground"
              >
                <HugeiconsIcon icon={File01Icon} className="size-3.5 text-primary" />
                <span className="max-w-[140px] truncate">{doc.title}</span>
                <button
                  type="button"
                  aria-label={`Remove reference to ${doc.title}`}
                  onClick={() => removeReference(doc.id)}
                  className="text-muted-foreground hover:text-foreground active:scale-[0.97]"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </span>
            ))}
            {pendingAttachments.map((attachment, i) => (
              <span
                key={`${attachment.file_name}-${i}`}
                className="flex items-center gap-1 rounded-md border bg-muted/60 px-2 py-1 text-xs text-foreground"
              >
                <HugeiconsIcon icon={File01Icon} className="size-3.5 text-muted-foreground" />
                <span className="max-w-[140px] truncate">{attachment.title}</span>
                <button
                  type="button"
                  aria-label={`Remove ${attachment.title}`}
                  onClick={() => removeAttachment(i)}
                  className="text-muted-foreground hover:text-foreground active:scale-[0.97]"
                >
                  <HugeiconsIcon icon={Cancel01Icon} className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}

        {slash.open ? (
          <div className="absolute bottom-full left-0 z-50 mb-2 w-full max-w-sm">
            <ComposerSlashMenu
              items={filteredCommands}
              query={slash.trigger?.query ?? ""}
              selected={slash.selected}
              onHover={slash.setSelected}
              onSelect={runCommand}
            />
          </div>
        ) : null}

        <ComposerPrimitive.Input
          ref={inputRef}
          rows={1}
          maxRows={8}
          autoFocus
          placeholder="How can I help you today? Type / for commands"
          className="resize-none bg-transparent px-1 py-1 text-sm outline-none placeholder:text-muted-foreground"
          onInput={(e) => {
            setText(e.currentTarget.value);
            setCaret(e.currentTarget.selectionStart ?? 0);
          }}
          onKeyDown={onComposerKeyDown}
          onKeyUp={syncCaret}
          onClick={syncCaret}
        />

        <input
          ref={fileRef}
          type="file"
          multiple
          hidden
          aria-label="Attach files"
          onChange={(e) => {
            void (async () => {
              const files = Array.from(e.target.files ?? []);
              if (!files.length) return;
              const read = await Promise.all(
                files.map(async (file) => ({
                  title: file.name.replace(/\.[^.]+$/, "") || file.name,
                  file_name: file.name,
                  mime_type: file.type || "application/octet-stream",
                  content: await readUploadFileContent(file),
                })),
              );
              onPendingAttachmentsChange([...pendingAttachments, ...read]);
              e.target.value = "";
            })();
          }}
        />

        <div className="flex items-center gap-1">
          <AgentPicker selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />

          {/* Enablement comes from GET /voice/policy — the workspace allowlist
              and kill switch, decided server-side. The button offers itself only
              when the server says voice is available, and shows why when not. */}
          <VoicePanel workspaceSlug={workspaceSlug} projectName={project?.name} />

          <ToolbarButton label="Attach" icon={Add01Icon} onClick={() => fileRef.current?.click()} />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Mention a document or epic"
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
              >
                <HugeiconsIcon icon={AtIcon} className="size-4" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
              {epics.length ? (
                <>
                  <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Epics</div>
                  {epics.map((epic) => (
                    <DropdownMenuItem key={epic.id} onSelect={() => insert(`@${epic.title}`)}>
                      <HugeiconsIcon icon={Layers01Icon} className="size-4 text-muted-foreground" />
                      <span className="truncate">{epic.title}</span>
                    </DropdownMenuItem>
                  ))}
                  <hr className="my-1 h-px border-0 bg-border" />
                </>
              ) : null}
              {docs.length ? (
                docs.map((doc) => (
                  <DropdownMenuItem key={doc.id} onSelect={() => insertMention(doc)}>
                    <HugeiconsIcon icon={File01Icon} className="size-4 text-muted-foreground" />
                    <span className="truncate">{doc.title}</span>
                  </DropdownMenuItem>
                ))
              ) : (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  BMAD docs appear here as Sprint-0 completes.
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <div className="flex-1" />

          <ToolbarButton label="Voice" icon={Mic01Icon} onClick={() => {}} />
          <ComposerPrimitive.Send asChild>
            <button
              type="button"
              onPointerDown={onBeforeSend}
              onClick={onSend}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
            >
              <HugeiconsIcon icon={SentIcon} className="size-4" />
              <span className="sr-only">Send</span>
            </button>
          </ComposerPrimitive.Send>
        </div>
      </ComposerPrimitive.Root>

      {projectId ? (
        <EpicPickerDialog
          open={epicPickerOpen}
          onOpenChange={setEpicPickerOpen}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          onSelect={onEpicPicked}
        />
      ) : null}
    </>
  );
}

function ToolbarButton({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: typeof Add01Icon;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-[0.97]"
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  );
}

export function GigsAiChat({
  workspaceSlug,
  threadId,
  projectId,
  initialPrompt,
  variant = "pane",
}: {
  workspaceSlug: string;
  threadId: string;
  projectId?: string;
  /** Auto-sent as the first user message when arriving from the home launcher (GIN-34). */
  initialPrompt?: string;
  variant?: "pane" | "full";
}) {
  const { data: thread } = useGigsThread(workspaceSlug, threadId);
  const queryClient = useQueryClient();
  const selectedAgentId = useGigsAiComposerStore((s) => s.selectedAgentId);
  const [referencedDocs, setReferencedDocs] = useState<IDocument[]>([]);
  const [pendingAttachments, setPendingAttachments] = useState<IGigsInlineAttachment[]>([]);
  const [paymentBlocked, setPaymentBlocked] = useState(false);
  const toolEvents = useToolEvents();
  const sendExtrasRef = useRef<IGigsChatSendExtras | null>(null);
  const snapshotSendExtras = () => {
    sendExtrasRef.current = {
      agent_id: selectedAgentId,
      document_ids: referencedDocs.map((doc) => doc.id),
      attachments: pendingAttachments,
    };
  };
  const transport = createGigsChatTransport(
    gigsAiService.messagesUrl(workspaceSlug, threadId),
    () => {
      const snap = sendExtrasRef.current;
      if (snap) {
        sendExtrasRef.current = null;
        return snap;
      }
      return {
        agent_id: selectedAgentId,
        document_ids: referencedDocs.map((doc) => doc.id),
        attachments: pendingAttachments,
      };
    },
    () => setPaymentBlocked(true),
    gigsAiService.confirmToolsUrl(workspaceSlug, threadId),
  );
  const initialMessages = buildInitialMessages(thread);
  // GIN-269: we own the AI-SDK `chat` handle (rather than letting
  // `useChatRuntime` construct + hide one) so `resume` below can call its
  // `regenerate({ metadata })` directly — assistant-ui's own
  // `MessageRuntime.reload(config)` discards `config` in the installed
  // @assistant-ui/react version, so the confirm decision never reached the
  // transport and the "Do it" flow hung forever. `regenerate({ metadata })`
  // forwards `metadata` straight to `prepareSendMessagesRequest` as
  // `requestMetadata`, which `createGigsChatTransport` reads for
  // `confirmDecisions` (see `chat-transport.ts`).
  const chat = useChat({
    id: threadId,
    transport,
    messages: initialMessages,
    onData: (part) => {
      toolEvents.onData(part);
      if (part.type === "data-usage" || part.type === "data-session") {
        queryClient.invalidateQueries({
          queryKey: queryKeys.aiThreadUsage(workspaceSlug, "_gigs", "_gigs", threadId),
        });
      }
    },
    // GIN-478: the turn is over — nothing else can arrive, so any tool still
    // "running"/"resuming" is stalled and must stop spinning. Also refresh the
    // work-item lists so items the agent created show up without a reload.
    onFinish: () => {
      toolEvents.settle();
      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: queryKeys.projectStories(workspaceSlug, projectId),
        });
      }
    },
    onError: () => toolEvents.settle(),
  });
  const runtime = useAISDKRuntime(chat);

  /** Resumes a paused tool-confirmation turn. Called from `MessageToolEvents`
   * when the user approves/cancels a confirm card. */
  const resume = (toolUseId: string, approved: boolean) => {
    toolEvents.setStatus(toolUseId, "resuming");
    chat.regenerate({
      metadata: { custom: { confirmDecisions: [{ tool_use_id: toolUseId, approved }] } },
    });
  };

  // GIN-34: a prompt handed over from the home launcher (`?q=`) is auto-sent as
  // the first message. Fire once; strip the query so a refresh (which re-seeds a
  // fresh thread) doesn't resend it.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (sentInitialRef.current) return;
    const prompt = initialPrompt?.trim();
    if (!prompt) return;
    sentInitialRef.current = true;
    runtime.thread.append(prompt);
    // Strip the query off the URL bar (no navigation) so a refresh — which
    // re-seeds a fresh thread — doesn't resend the prompt.
    window.history.replaceState(null, "", `/${workspaceSlug}/gigs-ai`);
  }, [initialPrompt, runtime, workspaceSlug]);

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <StoryProposalProvider value={{ workspaceSlug, projectId: projectId ?? null }}>
      <CitationProvider workspaceSlug={workspaceSlug} projectId={projectId ?? null}>
        <ToolEventsProvider value={{ events: toolEvents.events, setStatus: toolEvents.setStatus, resume }}>
        <ThreadPrimitive.Root className="flex min-h-0 flex-1 flex-col">
          <ThreadPrimitive.Viewport
            className={cn(
              "flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto",
              variant === "full" ? "mx-auto w-full max-w-3xl px-4 py-6" : "p-4",
            )}
          >
            <EmptyState />
            <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
          </ThreadPrimitive.Viewport>
          <div className={cn("shrink-0 border-t p-3", variant === "full" && "px-0")}>
            <div className={cn(variant === "full" && "mx-auto w-full max-w-3xl px-4")}>
              {paymentBlocked ? (
                <div className="mb-2">
                  <ChatPaymentNotice workspaceSlug={workspaceSlug} />
                </div>
              ) : null}
              <div className="mb-2 flex justify-end">
                <ChatUsageStrip slug={workspaceSlug} projectId="_gigs" storyId="_gigs" threadId={threadId} />
              </div>
              <Composer
                workspaceSlug={workspaceSlug}
                projectId={projectId}
                referencedDocs={referencedDocs}
                onReferencedDocsChange={setReferencedDocs}
                pendingAttachments={pendingAttachments}
                onPendingAttachmentsChange={setPendingAttachments}
                onBeforeSend={snapshotSendExtras}
                onSend={() => {
                  setReferencedDocs([]);
                  setPendingAttachments([]);
                  toolEvents.reset();
                }}
              />
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                GigsAI can make mistakes — double-check important responses.
              </p>
            </div>
          </div>
        </ThreadPrimitive.Root>
        </ToolEventsProvider>
      </CitationProvider>
      </StoryProposalProvider>
    </AssistantRuntimeProvider>
  );
}
