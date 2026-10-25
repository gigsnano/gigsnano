"use client";

import type { FormEvent } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Controlled search field with icon + clear affordance for search pages. */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "Search",
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit?.(value);
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg border bg-background px-3 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30",
        className,
      )}
    >
      <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
      />
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className={cn(
          "flex size-5 items-center justify-center rounded-full text-muted-foreground transition-[opacity,transform,color] duration-150 ease-out hover:text-foreground",
          value ? "scale-100 opacity-100" : "pointer-events-none scale-75 opacity-0",
        )}
      >
        <HugeiconsIcon icon={Cancel01Icon} className="size-3.5" />
      </button>
    </form>
  );
}
