import type { CodebaseViewId } from "@/types/code/intelligence";
import type { ICodebaseOverview } from "@/types/code/overview";

import { fmt } from "./overview-lib";

/** The at-a-glance counts row — real index totals, each cell linking to its view. */
export function CountsStrip({
  data,
  onOpenView,
}: {
  data: ICodebaseOverview;
  onOpenView: (view: CodebaseViewId) => void;
}) {
  const cells: { label: string; value: string; view: CodebaseViewId }[] = [
    { label: "Files", value: fmt(data.counts.files), view: "modules" },
    { label: "Symbols", value: fmt(data.counts.symbols), view: "dependencies" },
    { label: "Modules", value: fmt(data.modules.items.length), view: "modules" },
    { label: "Languages", value: fmt(data.counts.languages), view: "metrics" },
  ];
  return (
    <div
      className="gn-dash-card grid grid-cols-2 divide-x divide-y overflow-hidden rounded-xl border bg-card sm:grid-cols-4 sm:divide-y-0"
      style={{ ["--i" as string]: 0 }}
    >
      {cells.map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onOpenView(c.view)}
          className="flex flex-col items-start px-4 py-3 text-left outline-none transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          <span className="text-xl font-semibold tabular-nums leading-none">{c.value}</span>
          <span className="mt-1 text-[11px] text-muted-foreground">{c.label}</span>
        </button>
      ))}
    </div>
  );
}
