"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

/**
 * Shared shell for a home section: a small header row (title + optional count
 * and "view all" link) above arbitrary content. Keeps every section's rhythm
 * identical (DRY) so the page reads as one system.
 */
export function HomeSection({
  title,
  count,
  viewAllHref,
  viewAllLabel = "View all",
  children,
}: {
  title: string;
  count?: number;
  viewAllHref?: string;
  viewAllLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="flex items-baseline gap-2 text-sm font-semibold text-foreground">
          {title}
          {count !== undefined ? (
            <span className="text-xs font-normal tabular-nums text-muted-foreground">{count}</span>
          ) : null}
        </h2>
        {viewAllHref ? (
          <Link
            href={viewAllHref}
            className="group inline-flex items-center gap-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {viewAllLabel}
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              className="size-3.5 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
            />
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
