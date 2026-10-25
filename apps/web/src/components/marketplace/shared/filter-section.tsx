"use client";

import { useState, type ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowDown01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/**
 * Collapsible filter-rail section. Open/close animates via the CSS
 * grid-rows trick (0fr ↔ 1fr) so height tweens without measuring.
 */
export function FilterSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="border-b py-4 first:pt-0 last:border-b-0">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between rounded-md text-sm font-semibold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {title}
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          className={cn(
            "size-4 text-muted-foreground transition-transform duration-200 ease-out",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-col gap-2.5 pt-3">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** Checkbox / radio row used inside FilterSection. */
export function FilterOption({
  label,
  count,
  checked,
  onChange,
  type = "checkbox",
  name,
}: {
  label: string;
  count?: number;
  checked: boolean;
  onChange: () => void;
  type?: "checkbox" | "radio";
  name?: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground/90 transition-colors hover:text-foreground">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-[var(--primary)]"
      />
      <span className="flex-1">{label}</span>
      {count != null && <span className="text-xs tabular-nums text-muted-foreground">{count}</span>}
    </label>
  );
}
