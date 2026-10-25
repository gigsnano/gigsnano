"use client";

import type { ComponentProps } from "react";
import { Avatar as A } from "radix-ui";

import { cn } from "@/lib/utils";

const SIZE: Record<"xs" | "sm" | "md", string> = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
};

/** Deterministic tint from a name/id so avatars are stable across renders. */
const TINTS = [
  "bg-rose-500/15 text-rose-600 dark:text-rose-300",
  "bg-sky-500/15 text-sky-600 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300",
  "bg-violet-500/15 text-violet-600 dark:text-violet-300",
  "bg-amber-500/15 text-amber-600 dark:text-amber-300",
  "bg-cyan-500/15 text-cyan-600 dark:text-cyan-300",
];

function tintFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TINTS[h % TINTS.length];
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function Avatar({
  name,
  src,
  size = "sm",
  className,
  ...props
}: {
  name: string;
  src?: string | null;
  size?: "xs" | "sm" | "md";
} & ComponentProps<typeof A.Root>) {
  return (
    <A.Root
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        SIZE[size],
        className,
      )}
      {...props}
    >
      {src ? (
        <A.Image src={src} alt={name} className="size-full object-cover" />
      ) : null}
      <A.Fallback
        className={cn(
          "flex size-full items-center justify-center font-semibold",
          tintFor(name),
        )}
      >
        {initials(name)}
      </A.Fallback>
    </A.Root>
  );
}
