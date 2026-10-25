"use client";

import { useRef, useState } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import type { IconSvgElement } from "@hugeicons/react";
import {
  ZoomInAreaIcon,
  ZoomOutAreaIcon,
  ArrowExpand01Icon,
  RefreshIcon,
  Cancel01Icon,
} from "@hugeicons/core-free-icons";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const MIN = 0.4;
const MAX = 6;
const clamp = (v: number) => Math.min(MAX, Math.max(MIN, v));

/**
 * GIN-105 — pan + zoom + full-screen viewer for rendered diagrams (ER, flow,
 * architecture). Wraps sanitized diagram HTML (an SVG string) and adds mouse-wheel
 * zoom, drag-to-pan, +/−/reset controls, and a click-to-expand lightbox — so
 * diagrams are no longer cramped in the chat/docs. Transform-only (GPU) motion.
 */
export function DiagramZoomViewer({
  html,
  className,
}: {
  html: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pannable html={html} className={className} onExpand={() => setOpen(true)} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex h-[88vh] w-[92vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
          <DialogTitle className="sr-only">Diagram</DialogTitle>
          <div className="flex items-center justify-end border-b px-3 py-2">
            <button
              type="button"
              aria-label="Close diagram"
              onClick={() => setOpen(false)}
              className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} className="size-4" />
            </button>
          </div>
          {/* Fresh Pannable per open so it starts fit-to-view. */}
          {open ? <Pannable html={html} className="flex-1" /> : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Pannable({
  html,
  className,
  onExpand,
}: {
  html: string;
  className?: string;
  onExpand?: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);

  const reset = () => {
    setScale(1);
    setTx(0);
    setTy(0);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => clamp(s * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, tx, ty };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setTx(drag.current.tx + (e.clientX - drag.current.x));
    setTy(drag.current.ty + (e.clientY - drag.current.y));
  };
  const endDrag = (e: React.PointerEvent) => {
    if (drag.current && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    drag.current = null;
  };

  return (
    <div
      className={cn(
        "group relative overflow-hidden rounded-md border bg-card",
        className,
      )}
    >
      <div
        role="presentation"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
        onDoubleClick={reset}
        className="flex h-full min-h-40 w-full cursor-grab touch-none items-center justify-center active:cursor-grabbing"
      >
        <div
          className="gn-doc-mermaid origin-center"
          style={{ transform: `translate(${tx}px, ${ty}px) scale(${scale})` }}
          // Diagram HTML is mermaid strict-mode output, already sanitized upstream.
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>

      {/* Controls — appear on hover, always visible on touch. */}
      <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg border bg-background/90 p-1 opacity-0 shadow-sm backdrop-blur transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Ctl label="Zoom out" icon={ZoomOutAreaIcon} onClick={() => setScale((s) => clamp(s / 1.2))} />
        <span className="min-w-9 text-center text-xs tabular-nums text-muted-foreground">
          {Math.round(scale * 100)}%
        </span>
        <Ctl label="Zoom in" icon={ZoomInAreaIcon} onClick={() => setScale((s) => clamp(s * 1.2))} />
        <Ctl label="Reset" icon={RefreshIcon} onClick={reset} />
        {onExpand ? <Ctl label="Full screen" icon={ArrowExpand01Icon} onClick={onExpand} /> : null}
      </div>
    </div>
  );
}

function Ctl({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: IconSvgElement;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground active:scale-95"
    >
      <HugeiconsIcon icon={icon} className="size-4" />
    </button>
  );
}
