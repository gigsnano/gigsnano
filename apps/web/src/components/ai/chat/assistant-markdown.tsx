"use client";

import { Streamdown } from "streamdown";
import { cn } from "@/lib/utils";
import { chatMarkdownComponents } from "./chat-markdown-components";

/**
 * Renders a (possibly incomplete, mid-stream) markdown string for an assistant
 * chat message. streamdown tolerates unterminated `**`, code fences, and list
 * items as tokens arrive, so this is safe to render on every streamed delta.
 * `space-y-2` (tailwind-merge replaces streamdown's `space-y-4`) plus the
 * chat-scale element renderers keep replies compact and on-brand rather than
 * document-scale.
 */
export function AssistantMarkdown({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <Streamdown
      className={cn("space-y-2 text-sm leading-relaxed", className)}
      components={chatMarkdownComponents}
    >
      {text}
    </Streamdown>
  );
}
