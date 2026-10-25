import type { ReactNode } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";

import { cn } from "@/lib/utils";
import type { IProvenance } from "@/types/code/overview";

import { relativeTime, SECTION_STATE_META } from "./overview-lib";

/** The consistent shell every Overview section sits in: titled card + a state
 * chip (Live/Stale/Indexing/Unavailable — label, not colour alone) and a
 * provenance footer (source · freshness). One component keeps the eight cards
 * visually cohesive and makes "no fabricated metric without provenance" structural
 * rather than per-card discipline. */
export function SectionCard({
  title,
  icon,
  provenance,
  action,
  children,
  index = 0,
  className,
}: {
  title: string;
  icon: IconSvgElement;
  provenance: IProvenance;
  action?: ReactNode;
  children: ReactNode;
  index?: number;
  className?: string;
}) {
  const meta = SECTION_STATE_META[provenance.state];
  return (
    <section
      className={cn(
        "gn-dash-card flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm",
        className,
      )}
      style={{ ["--i" as string]: index }}
      aria-label={title}
    >
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2.5">
        <HugeiconsIcon icon={icon} className="size-4 shrink-0 text-muted-foreground" />
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        <span
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 text-[11px] font-medium",
            meta.tone,
          )}
        >
          <span
            className={cn(
              "size-1.5 rounded-full bg-current",
              provenance.state === "indexing" && "animate-pulse",
            )}
            aria-hidden
          />
          {meta.label}
        </span>
        {action ? <div className="-my-1 ml-1">{action}</div> : null}
      </header>
      <div className="min-h-0 flex-1 px-4 pb-3">{children}</div>
      {(provenance.source || provenance.built_at) && (
        <footer className="flex items-center gap-1.5 border-t px-4 py-2 text-[11px] text-muted-foreground">
          <span className="truncate">{provenance.source}</span>
          {provenance.built_at ? (
            <>
              <span aria-hidden>·</span>
              <time dateTime={provenance.built_at} title={provenance.built_at}>
                {relativeTime(provenance.built_at)}
              </time>
            </>
          ) : null}
        </footer>
      )}
    </section>
  );
}
