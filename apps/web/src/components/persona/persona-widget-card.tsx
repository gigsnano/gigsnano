import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";

import { WIDGET_TYPES } from "@/components/dashboards/widgets/widget-registry";
import type { IPersonaWidget } from "@/lib/persona/persona-config";
import type { IDashboardWidget } from "@/types";
import { cn } from "@/lib/utils";

const SPAN_CLASS: Record<number, string> = {
  1: "",
  2: "lg:col-span-2",
  3: "lg:col-span-2 xl:col-span-3",
};

// Staggered rise on mount — gentle (never from scale(0)), sub-500ms, ease-out,
// 40ms Stagger token per card, gated behind motion-safe (reduced-motion = instant).
const ENTER =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out";

/** One curated persona widget — reuses the GIN-45 widget-registry body (self-
 * fetching from workspaceSlug), wrapped in a read-only card frame. */
export function PersonaWidgetCard({
  workspaceSlug,
  widget,
  index = 0,
}: {
  workspaceSlug: string;
  widget: IPersonaWidget;
  index?: number;
}) {
  const meta = WIDGET_TYPES[widget.type];
  const stub: IDashboardWidget = {
    id: `persona-${widget.type}-${widget.title}`,
    type: widget.type,
    title: widget.title,
    x: 0,
    y: 0,
    w: meta.defaultSize.w,
    h: meta.defaultSize.h,
    settings: widget.settings,
  };

  const style: CSSProperties = { animationDelay: `${Math.min(index, 10) * 40}ms` };

  return (
    <div className={SPAN_CLASS[widget.colSpan ?? 1]}>
      <div style={style} className={cn("flex h-full flex-col overflow-hidden rounded-xl border bg-card", ENTER)}>
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <HugeiconsIcon icon={meta.icon} className="size-3.5 text-muted-foreground" />
          <span className="truncate text-xs font-medium">{widget.title}</span>
        </div>
        <div className="overflow-auto p-3" style={{ height: widget.minH ?? 220 }}>
          {meta.render(stub, { workspaceSlug })}
        </div>
      </div>
    </div>
  );
}
