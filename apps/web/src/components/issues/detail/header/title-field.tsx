"use client";

import { useEffect, useRef } from "react";

import { useAdjustedState } from "@/hooks/ui/use-adjusted-state";

/** Grow a textarea to fit its content (Plane-style multiline title). */
function autosize(el: HTMLTextAreaElement) {
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** Inline work-item title editor. Shared by the legacy view and the v2 Overview. */
export function IssueTitleField({
  initialTitle,
  onTitleChange,
}: {
  initialTitle: string;
  onTitleChange: (value: string) => void;
}) {
  const [title, setTitle] = useAdjustedState(initialTitle);
  const ref = useRef<HTMLTextAreaElement>(null);

  // Fit height on mount and whenever the title changes (incl. switching stories).
  useEffect(() => {
    if (ref.current) autosize(ref.current);
  }, [title]);

  return (
    <textarea
      ref={ref}
      aria-label="Issue title"
      rows={1}
      value={title}
      onChange={(e) => {
        const value = e.target.value;
        setTitle(value);
        onTitleChange(value);
        autosize(e.target);
      }}
      placeholder="Issue title"
      className="w-full resize-none border-none bg-transparent text-xl font-semibold leading-snug tracking-[-0.01em] text-foreground outline-none placeholder:text-muted-foreground"
    />
  );
}
