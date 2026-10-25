"use client";

import { useRef, useState } from "react";
import {
  ComposerPrimitive,
  useComposerRuntime,
} from "@assistant-ui/react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  AtIcon,
  Cancel01Icon,
  File01Icon,
  SentIcon,
} from "@hugeicons/core-free-icons";

import { ComposerSlashMenu } from "@/components/ai/composer/composer-slash-menu";
import { useComposerSlash } from "@/components/ai/composer/use-composer-slash";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AGENT_COMMANDS, type IAgentCommand } from "@/constants/agent-commands";
import { filterAgentCommands } from "@/lib/ai/agent-command-filter";
import { useProjectDocuments } from "@/hooks/docs/use-documents";
import type { IDocument } from "@/types";

export function StoryChatComposer({
  workspaceSlug,
  projectId,
  referencedDocs,
  onReferencedDocsChange,
  mentionDocuments,
  agentId,
}: {
  workspaceSlug: string;
  projectId: string;
  referencedDocs: IDocument[];
  onReferencedDocsChange: (docs: IDocument[]) => void;
  /** When set (contractor route), skip the member-only workspace documents hook. */
  mentionDocuments?: IDocument[];
  /** Filters slash commands to this BMAD agent; omit to show all. */
  agentId?: string | null;
}) {
  const composer = useComposerRuntime();
  const projectDocs = useProjectDocuments(workspaceSlug, projectId, mentionDocuments === undefined);
  const documents = mentionDocuments ?? projectDocs.data;
  const [text, setText] = useState("");
  const [caret, setCaret] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
    agentId: agentId ?? undefined,
    query: slash.trigger?.query,
  });

  const insertMention = (doc: IDocument) => {
    const cur = composer.getState().text;
    const next = (cur ? `${cur} ` : "") + `@${doc.title} `;
    replaceText(next, next.length);
    if (!referencedDocs.some((d) => d.id === doc.id)) {
      onReferencedDocsChange([...referencedDocs, doc]);
    }
  };

  const removeReference = (docId: string) => {
    onReferencedDocsChange(referencedDocs.filter((d) => d.id !== docId));
  };

  const runCommand = (command: IAgentCommand) => {
    if (command.action === "open-epic-breakdown") {
      slash.dismiss();
      return;
    }
    const template = command.prompt_template ?? command.slash;
    slash.replaceWith(template);
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
    <ComposerPrimitive.Root className="relative flex flex-col gap-2 rounded-xl border bg-background p-1.5 transition-shadow focus-within:ring-[3px] focus-within:ring-ring/50">
      {referencedDocs.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-1 pt-1">
          {referencedDocs.map((doc) => (
            <span
              key={doc.id}
              className="flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2 py-0.5 text-xs text-foreground"
            >
              <HugeiconsIcon icon={File01Icon} className="size-3 text-primary" />
              <span className="max-w-[120px] truncate">{doc.title}</span>
              <button
                type="button"
                aria-label={`Remove reference to ${doc.title}`}
                onClick={() => removeReference(doc.id)}
                className="text-muted-foreground transition-colors hover:text-foreground active:scale-[0.97]"
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
        minRows={1}
        maxRows={6}
        autoFocus
        placeholder="Message the agent… Type / for commands"
        // w-full (not flex-1): react-textarea-autosize drives height via an inline
        // style, which a flex item's `flex: 1 1 0%` would override — collapsing it
        // to one clipped row. Sizing by content lets it grow 1→6 rows, then scroll.
        className="w-full resize-none bg-transparent px-2 py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        onInput={(e) => {
          setText(e.currentTarget.value);
          setCaret(e.currentTarget.selectionStart ?? 0);
        }}
        onKeyDown={onComposerKeyDown}
        onKeyUp={syncCaret}
        onClick={syncCaret}
      />

      <div className="flex items-end gap-1 px-1 pb-0.5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Reference a document"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.97]"
            >
              <HugeiconsIcon icon={AtIcon} className="size-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 w-64 overflow-y-auto">
            {documents?.length ? (
              documents.map((doc) => (
                <DropdownMenuItem key={doc.id} onSelect={() => insertMention(doc)}>
                  <HugeiconsIcon icon={File01Icon} className="size-4 text-muted-foreground" />
                  <span className="truncate">{doc.title}</span>
                </DropdownMenuItem>
              ))
            ) : (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                Upload or generate documents to reference them here.
              </div>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="flex-1" />

        <ComposerPrimitive.Send asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-transform duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40"
          >
            <HugeiconsIcon icon={SentIcon} className="size-4" />
            <span className="sr-only">Send</span>
          </button>
        </ComposerPrimitive.Send>
      </div>
    </ComposerPrimitive.Root>
  );
}
