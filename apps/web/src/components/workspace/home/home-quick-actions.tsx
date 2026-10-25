"use client";

import type { CSSProperties } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import { Add01Icon, Menu01Icon, Analytics01Icon, File01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

interface IQuickAction {
  label: string;
  href: string;
  icon: IconSvgElement;
  /** Tailwind text-color class for the icon tint. */
  tint: string;
}

/**
 * Fast lanes into the most common destinations. Each card rises in with the
 * shared `--i`-indexed stagger and lifts on hover (press-scale for feedback).
 */
export function HomeQuickActions({ workspaceSlug }: { workspaceSlug: string }) {
  const actions: IQuickAction[] = [
    { label: "New project", href: `/${workspaceSlug}/projects`, icon: Add01Icon, tint: "text-primary" },
    { label: "Work items", href: `/${workspaceSlug}/work-items`, icon: Menu01Icon, tint: "text-sky-500" },
    { label: "Analytics", href: `/${workspaceSlug}/analytics`, icon: Analytics01Icon, tint: "text-emerald-500" },
    { label: "Docs", href: `/${workspaceSlug}/docs`, icon: File01Icon, tint: "text-amber-500" },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      {actions.map((a, i) => (
        <Link
          key={a.label}
          href={a.href}
          style={{ "--i": i } as CSSProperties}
          className={cn(
            "t-home-rise t-card-lift group flex items-center gap-2.5 rounded-xl border bg-card px-3.5 py-3",
            "active:scale-[0.98]",
          )}
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
            <HugeiconsIcon icon={a.icon} className={cn("size-4", a.tint)} />
          </span>
          <span className="text-sm font-medium text-foreground">{a.label}</span>
        </Link>
      ))}
    </div>
  );
}
