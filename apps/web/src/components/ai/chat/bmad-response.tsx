"use client";

import { useState } from "react";
import {
  useMessage,
  useThread,
  useThreadRuntime,
  type TextMessagePartComponent,
} from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import { parseBmadResponse, type BmadChoiceOption } from "@/lib/chat/bmad-response";
import { transformCitations } from "@/lib/chat/citation";
import { parseDiagramBlocks, stripDiagramBlocks } from "@/lib/chat/diagram-block";
import { parseErdBlocks, stripErdBlocks } from "@/lib/chat/erd-block";
import { parseStoryProposals, stripStoryProposals } from "@/lib/chat/story-proposal";
import type { IDiagramNode } from "@/types";
import { AssistantMarkdown } from "./assistant-markdown";
import { useChatSession } from "./chat-session-context";
import { DbmlErdCanvas } from "./dbml-erd-canvas";
import { DiagramCanvas } from "./diagram-canvas";
import { ErdCanvas } from "./erd-canvas";
import { StoryProposalCard } from "./story-proposal-card";

function ChoiceWidget({
  options,
  disabled,
  onPick,
}: {
  options: BmadChoiceOption[];
  disabled: boolean;
  onPick: (value: string) => void;
}) {
  const [picked, setPicked] = useState(false);
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      {options.map((opt) => (
        <Button
          key={opt.n}
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled || picked}
          aria-label={`Choose option ${opt.n}: ${opt.label}`}
          className="h-auto justify-start whitespace-normal py-1.5 text-left transition-transform duration-150 ease-out active:scale-[0.98]"
          onClick={() => {
            setPicked(true);
            onPick(opt.n);
          }}
        >
          <span className="mr-2 shrink-0 font-medium text-muted-foreground">
            {opt.n}
          </span>
          <span>{opt.label}</span>
        </Button>
      ))}
    </div>
  );
}

function OpenWidget({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState("");
  const send = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  };
  return (
    <div className="mt-2 flex flex-col gap-1.5">
      <textarea
        aria-label="Answer the question"
        placeholder="Answer…"
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
            e.preventDefault();
            send();
          }
        }}
        className="w-full resize-none rounded-lg border bg-background px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled || value.trim() === ""}
        className="self-end transition-transform duration-150 ease-out active:scale-[0.97]"
        onClick={send}
      >
        Send
      </Button>
    </div>
  );
}

/**
 * Assistant-ui `Text` slot that renders markdown and, when the message is
 * complete AND the last in the thread, surfaces an interactive widget for
 * recognizable BMAD response types. Clicking/submitting auto-sends a new user
 * turn through the thread runtime.
 */
export const BmadResponseParts: TextMessagePartComponent = ({ text, status }) => {
  const thread = useThreadRuntime();
  const isLast = useMessage((m) => m.isLast);
  const hasUserTurn = useThread((t) => t.messages.some((m) => m.role === "user"));
  // A finalized session 409s any new turn, so its inline widgets render inert.
  const { isFinalized } = useChatSession();

  // Only a fully-complete message may surface a widget — never mid-stream
  // (`running`) and never a cancelled/filtered/truncated (`incomplete`) turn.
  if (status.type !== "complete") {
    return <AssistantMarkdown text={text} />;
  }

  // Story proposals (`gigs:story` blocks) are parsed first and stripped from
  // the text handed to parseBmadResponse — but only when at least one exists,
  // so a message with none is byte-identical to the pre-GIN-18 render path.
  const proposals = parseStoryProposals(text);
  const diagrams = parseDiagramBlocks(text);
  // gigs:erd blocks: schema-carrying ones render directly; dbml-only ones are
  // resolved through the backend parser by DbmlErdCanvas (see erdCanvases below).
  const erds = parseErdBlocks(text);
  let cleanText = text;
  if (proposals.length > 0) cleanText = stripStoryProposals(cleanText);
  if (diagrams.length > 0) cleanText = stripDiagramBlocks(cleanText);
  if (erds.length > 0) cleanText = stripErdBlocks(cleanText);
  const parsed = parseBmadResponse(cleanText);
  const body = transformCitations(parsed.body);
  const widget = parsed.widget;
  // At most one block per reply (per the prompt convention), so the title is
  // a stable-enough key — avoids an array-index key per react-doctor.
  const cards = proposals.map((p) => <StoryProposalCard key={p.title} proposal={p} />);
  const drillDown = (node: IDiagramNode) =>
    thread.append(`Explain "${node.label}" in more detail — trace what it does and what it calls.`);
  const diagramCanvases = diagrams.map((d) => (
    <DiagramCanvas key={d.id} block={d} onDrillDown={drillDown} />
  ));
  // Schema present → render directly; dbml-only → resolve via the backend parser.
  const erdCanvases = erds.map((e) =>
    e.schema ? (
      <ErdCanvas key={e.id} schema={e.schema} />
    ) : e.dbml ? (
      <DbmlErdCanvas key={e.id} dbml={e.dbml} id={e.id} />
    ) : null,
  );

  // Widgets only make sense on the latest message, once the user has sent
  // at least one turn (suppresses a widget on the very first greeting,
  // which would duplicate the composer); older ones render inert.
  if (!widget || !isLast || !hasUserTurn || isFinalized) {
    if (proposals.length === 0 && diagrams.length === 0 && erdCanvases.length === 0)
      return <AssistantMarkdown text={body} />;
    return (
      <div>
        <AssistantMarkdown text={body} />
        {diagramCanvases}
        {erdCanvases}
        {cards}
      </div>
    );
  }

  const send = (value: string) => thread.append(value);

  return (
    <div>
      <AssistantMarkdown text={body} />
      {diagramCanvases}
      {erdCanvases}
      {widget.kind === "choice" ? (
        <ChoiceWidget options={widget.options} disabled={false} onPick={send} />
      ) : (
        <OpenWidget disabled={false} onSubmit={send} />
      )}
      {cards}
    </div>
  );
};
