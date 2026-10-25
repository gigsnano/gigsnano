"use client";

import { useState } from "react";

export interface SlashTrigger {
  query: string;
  start: number;
  end: number;
}

/** Detect an active `/command` token at the caret in plain text. */
function detectSlashTrigger(text: string, caret: number): SlashTrigger | null {
  const before = text.slice(0, caret);
  const match = /(?:^|\s)(\/[\w-]*)$/.exec(before);
  if (!match) return null;
  const token = match[1];
  const start = before.length - token.length;
  return { query: token.slice(1), start, end: caret };
}

export function useComposerSlash({
  text,
  caret,
  onReplace,
}: {
  text: string;
  caret: number;
  onReplace: (nextText: string, nextCaret: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(0);
  const trigger = detectSlashTrigger(text, caret);

  // Sync open/selected to the active trigger during render (not via an effect):
  // an effect would show one commit with the stale value before correcting it,
  // and forces the compiler to bail out of memoizing this hook. Keyed on the
  // trigger identity + text so a manual dismiss (Escape/select) stays closed
  // until the token next changes — same trigger set as the old effect deps.
  const triggerKey = `${trigger?.query ?? ""}|${trigger?.start ?? -1}|${text}`;
  const [prevTriggerKey, setPrevTriggerKey] = useState(triggerKey);
  if (triggerKey !== prevTriggerKey) {
    setPrevTriggerKey(triggerKey);
    setOpen(Boolean(trigger));
    setSelected(0);
  }

  const dismiss = () => setOpen(false);

  const replaceWith = (replacement: string) => {
    if (!trigger) return;
    const before = text.slice(0, trigger.start);
    const after = text.slice(trigger.end);
    const spacer = after.startsWith(" ") || !after ? "" : " ";
    const next = `${before}${replacement}${spacer}${after}`;
    const nextCaret = before.length + replacement.length + spacer.length;
    onReplace(next, nextCaret);
    setOpen(false);
  };

  const onKeyDown = (event: React.KeyboardEvent, itemCount: number): boolean => {
    if (!open || itemCount === 0) return false;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setSelected((i) => (i + itemCount - 1) % itemCount);
      return true;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setSelected((i) => (i + 1) % itemCount);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      return true;
    }
    return false;
  };

  return {
    open,
    trigger,
    selected,
    setSelected,
    dismiss,
    replaceWith,
    onKeyDown,
  };
}
