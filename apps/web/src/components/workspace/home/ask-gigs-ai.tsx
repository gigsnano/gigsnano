"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { AiMagicIcon, SentIcon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Starter prompts — each launches the full GigsAI chat. */
const SUGGESTIONS = [
  "Draft a PRD for a new feature",
  "Summarize my in-progress work",
  "Plan the next sprint",
] as const;

/**
 * The home hero: an inviting "Ask GigsAI" composer. Submitting (or picking a
 * suggestion) routes to the full GigsAI chat — GigsNano's embedded-agents
 * differentiator, mirroring Plane's "Ask Plane AI" launcher.
 */
export function AskGigsAi({ workspaceSlug }: { workspaceSlug: string }) {
  const router = useRouter();
  const [value, setValue] = useState("");

  // Carry the prompt to the chat as `?q=` so it's sent as the first message
  // (GIN-34: previously the text was dropped and the chat opened empty).
  const launch = (prompt?: string) => {
    const q = prompt?.trim();
    router.push(`/${workspaceSlug}/gigs-ai${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    launch(value);
  };

  return (
    <div className="flex flex-col gap-3">
      <form
        onSubmit={onSubmit}
        className={cn(
          "group flex items-center gap-2.5 rounded-xl border bg-card p-2 pl-3.5",
          "shadow-sm transition-[box-shadow,border-color] duration-200",
          "focus-within:border-ring/60 focus-within:ring-[3px] focus-within:ring-ring/40",
        )}
      >
        <HugeiconsIcon icon={AiMagicIcon} className="size-5 shrink-0 text-primary" />
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Ask GigsAI anything, or start a task…"
          aria-label="Ask GigsAI"
          className="min-w-0 flex-1 bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          aria-label="Ask GigsAI"
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground",
            "transition-[transform,opacity] duration-150 ease-out active:scale-95",
          )}
        >
          <HugeiconsIcon icon={SentIcon} className="size-4" />
        </button>
      </form>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => launch(s)}
            className={cn(
              "rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground",
              "transition-[color,background-color,border-color,transform] duration-150 ease-out",
              "hover:border-ring/50 hover:bg-accent/60 hover:text-foreground active:scale-[0.97]",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
