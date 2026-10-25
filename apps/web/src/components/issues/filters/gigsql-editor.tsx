"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { HelpCircleIcon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { parseGigsql } from "@/lib/views/gigsql";
import {
  STORY_PRIORITY_ORDER,
  STORY_STATUS_ORDER,
} from "@/constants/story-meta";

const GIGSQL_FIELDS = [
  "status",
  "priority",
  "type",
  "assignee",
  "label",
  "cycle",
  "module",
  "title",
  "startDate",
  "dueDate",
  "createdAt",
  "updatedAt",
];

const FIELD_OPERATORS: Record<string, string[]> = {
  status: ["=", "!=", "in", "not in", "is null"],
  priority: ["=", "!=", "in", "not in"],
  assignee: ["=", "!=", "in", "not in", "is null"],
  label: ["=", "!=", "in", "not in"],
  title: ["=", "!=", "~"],
  dueDate: ["=", "!=", "<", "<=", ">", ">=", "between", "is null"],
  createdAt: ["=", "!=", "<", "<=", ">", ">=", "between", "is null"],
};

function buildSuggestions(text: string, caret: number): string[] {
  const before = text.slice(0, caret);
  const tokens = before.split(/\s+/);
  const last = tokens[tokens.length - 1] ?? "";

  if (!before.trim() || before.endsWith("(")) {
    return GIGSQL_FIELDS.filter((f) => f.startsWith(last.toLowerCase()) || !last);
  }

  const fieldMatch = before.match(/(\w+)\s*$/);
  if (fieldMatch && !before.match(/\s[=~!<]/)) {
    const field = fieldMatch[1].toLowerCase();
    const ops = FIELD_OPERATORS[field] ?? ["=", "!=", "in"];
    return ops.filter((op) => op.startsWith(last.toLowerCase()) || !last);
  }

  const valueMatch = before.match(/(\w+)\s*(=|!=|~|>=|<=|>|<|in|not in)\s*(\w*)$/i);
  if (valueMatch) {
    const field = valueMatch[1].toLowerCase();
    const partial = (valueMatch[3] ?? "").toLowerCase();
    if (field === "status") {
      return STORY_STATUS_ORDER.filter((s) => s.startsWith(partial));
    }
    if (field === "priority") {
      return STORY_PRIORITY_ORDER.filter((p) => p.startsWith(partial));
    }
    if (field === "assignee") {
      return ["me", "unassigned"].filter((v) => v.startsWith(partial));
    }
  }

  return [];
}

/** GigsQL text editor with validation, autocomplete, and syntax help. */
export function GigsqlEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (query: string) => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [caret, setCaret] = useState(0);
  const parsed = parseGigsql(value);
  const suggestions = buildSuggestions(value, caret);

  const applySuggestion = (item: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const before = value.slice(0, el.selectionStart);
    const after = value.slice(el.selectionEnd);
    const tokens = before.split(/\s+/);
    tokens[tokens.length - 1] = item;
    const next = `${tokens.join(" ")}${after.startsWith(" ") || !after ? "" : " "}${after}`;
    onChange(next.trimStart());
    setCaret(next.length);
  };

  return (
    <div className="space-y-2 px-3 py-3">
      <div className="relative">
        <textarea
          ref={textareaRef}
          aria-label="GigsQL filter query"
          value={value}
          rows={4}
          spellCheck={false}
          placeholder="priority = high AND status in (todo, in_progress)"
          onChange={(e) => {
            onChange(e.target.value);
            setCaret(e.target.selectionStart);
          }}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
          onKeyDown={(e) => {
            if (e.key === "Tab" && suggestions.length) {
              e.preventDefault();
              applySuggestion(suggestions[0]);
            }
          }}
          className={cn(
            "w-full resize-y rounded-md border bg-background px-3 py-2 font-mono text-sm",
            parsed.kind === "error" && value.trim()
              ? "border-destructive focus-visible:ring-destructive/30"
              : "border-input",
          )}
        />
        {suggestions.length > 0 ? (
          <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-36 overflow-y-auto rounded-md border bg-popover py-1 shadow-md">
            {suggestions.slice(0, 8).map((item) => (
              <li key={item}>
                <button
                  type="button"
                  className="flex w-full px-3 py-1.5 text-left font-mono text-xs hover:bg-accent/60"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    applySuggestion(item);
                  }}
                >
                  {item}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>

      {parsed.kind === "error" && value.trim() ? (
        <p className="text-xs text-destructive" role="alert">
          {parsed.reason}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Use AND / OR, parentheses, and field operators. Tab accepts a suggestion.
        </p>
      )}

      <GigsqlHelp />
    </div>
  );
}

function GigsqlHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs text-muted-foreground transition-transform active:scale-[0.97]"
        >
          <HugeiconsIcon icon={HelpCircleIcon} className="size-3.5" />
          GigsQL help
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 text-xs">
        <p className="mb-2 font-medium text-foreground">Examples</p>
        <ul className="space-y-1.5 font-mono text-muted-foreground">
          <li>priority = high AND status in (todo, in_progress)</li>
          <li>assignee = me OR assignee is null</li>
          <li>(title ~ login) AND dueDate &gt;= 2026-07-01</li>
          <li>dueDate between 2026-07-01 and 2026-07-31</li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
