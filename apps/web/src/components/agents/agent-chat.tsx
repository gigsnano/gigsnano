"use client";

import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  MessagePrimitive,
  ComposerPrimitive,
  type ChatModelAdapter,
  type ThreadMessageLike,
} from "@assistant-ui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import { SentIcon } from "@hugeicons/core-free-icons";

import type { IAgent } from "@/types";
import { BmadResponseParts } from "@/components/ai/chat/bmad-response";

function makeMockAdapter(agent: IAgent): ChatModelAdapter {
  return {
    async *run({ abortSignal }) {
      const reply =
        `I'm ${agent.name} (${agent.persona}), your ${agent.domain} specialist. ` +
        `${agent.instructions} Ask a question or describe what you're working on; I'll respond ` +
        `with guidance. (Mock reply — connect a model to make it real.)`;
      let text = "";
      for (const word of reply.split(" ")) {
        if (abortSignal.aborted) break;
        text += (text ? " " : "") + word;
        await new Promise((r) => setTimeout(r, 22));
        yield { content: [{ type: "text", text }] };
      }
    },
  };
}

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
        <MessagePrimitive.Parts components={{ Text: BmadResponseParts }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function Composer() {
  return (
    <ComposerPrimitive.Root className="flex items-end gap-2 rounded-xl border bg-background p-1.5 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50">
      <ComposerPrimitive.Input
        rows={1}
        maxRows={4}
        placeholder="Message the agent…"
        className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
      />
      <ComposerPrimitive.Send asChild>
        <button
          type="button"
          className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
        >
          <HugeiconsIcon icon={SentIcon} className="size-4" />
          <span className="sr-only">Send</span>
        </button>
      </ComposerPrimitive.Send>
    </ComposerPrimitive.Root>
  );
}

export function AgentChat({ agent }: { agent: IAgent }) {
  const initialMessages: ThreadMessageLike[] = [
    {
      role: "assistant",
      content: [
        {
          type: "text",
          text: `Hi! I'm ${agent.name}, your ${agent.domain} specialist. What would you like to explore?`,
        },
      ],
    },
  ];

  const adapter = makeMockAdapter(agent);
  const runtime = useLocalRuntime(adapter, { initialMessages });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex max-h-80 flex-col overflow-hidden rounded-lg border bg-card">
        <ThreadPrimitive.Viewport className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
          <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
        </ThreadPrimitive.Viewport>
        <div className="shrink-0 border-t p-3">
          <Composer />
        </div>
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
