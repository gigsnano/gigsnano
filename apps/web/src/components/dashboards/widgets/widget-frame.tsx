"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { DragDropIcon, Cancel01Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";
import type { IDashboardWidget, IWidgetSettings } from "@/types";

import { WIDGET_TYPES, type IWidgetRenderContext } from "./widget-registry";
import { WidgetSettings } from "./widget-settings";

/**
 * Chrome around one widget: a drag handle (the react-grid-layout draggable
 * region), the title, a remove button, and the type's body. The whole card is
 * NOT draggable — only the header handle — so buttons/scroll inside stay usable.
 */
export function WidgetFrame({
  widget,
  ctx,
  editable,
  onRemove,
  onUpdateSettings,
}: {
  widget: IDashboardWidget;
  ctx: IWidgetRenderContext;
  editable: boolean;
  onRemove: (id: string) => void;
  onUpdateSettings: (id: string, settings: IWidgetSettings) => void;
}) {
  const meta = WIDGET_TYPES[widget.type];
  if (!meta) return null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center gap-1.5 border-b px-3 py-2">
        {editable ? (
          <span
            className="widget-drag-handle -ml-1 flex size-6 cursor-grab items-center justify-center rounded text-muted-foreground/60 hover:bg-muted hover:text-muted-foreground active:cursor-grabbing"
            aria-hidden="true"
          >
            <HugeiconsIcon icon={DragDropIcon} className="size-4" />
          </span>
        ) : null}
        <h4 className="min-w-0 flex-1 truncate text-sm font-medium">
          {widget.title || meta.label}
        </h4>
        {editable ? (
          <>
            <WidgetSettings
              type={widget.type}
              workspaceSlug={ctx.workspaceSlug}
              settings={widget.settings ?? {}}
              onChange={(settings) => onUpdateSettings(widget.id, settings)}
            />
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              aria-label={`Remove ${widget.title || meta.label}`}
              onClick={() => onRemove(widget.id)}
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-3.5 text-muted-foreground" />
            </Button>
          </>
        ) : null}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">{meta.render(widget, ctx)}</div>
    </div>
  );
}
