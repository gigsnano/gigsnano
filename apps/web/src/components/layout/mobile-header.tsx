"use client";

import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/** Compact title bar for deep project sub-routes on small screens (Plane mobile-header pattern). */
export function MobileHeader({
  backHref,
  title,
  className,
  actions,
}: {
  backHref: string;
  title: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 border-b px-4 py-2.5 md:hidden",
        className,
      )}
    >
      <Link
        href={backHref}
        aria-label="Go back"
        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <HugeiconsIcon icon={ArrowLeft01Icon} className="size-4" />
      </Link>
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold">{title}</h1>
      {actions ? <div className="shrink-0">{actions}</div> : null}
    </div>
  );
}
