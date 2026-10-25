"use client";

import { Delete02Icon, Flag02Icon, MoreHorizontalCircle01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useRef, useState } from "react";

import type { IDemoItem, TDemoStatus } from "./demo-data";
import { ios, text } from "./ios-css";
import { StatusRing } from "./status-ring";

const ACTION_W = 72;
const ACTIONS: { label: string; icon: IconSvgElement; color: string }[] = [
  { label: "Details", icon: MoreHorizontalCircle01Icon, color: "var(--ios-tint-gray)" },
  { label: "Flag", icon: Flag02Icon, color: "var(--ios-tint-orange)" },
  { label: "Delete", icon: Delete02Icon, color: "var(--ios-destructive)" },
];
const OPEN = -ACTION_W * ACTIONS.length;
const SLOP = 8;

/** Apple's rubber-band: the further past the edge, the less it follows. */
function rubberband(overshoot: number, dimension = 320, k = 0.55) {
  return (overshoot * dimension * k) / (dimension + k * Math.abs(overshoot));
}

interface IDragState {
  x: number;
  start: number;
  lastX: number;
  lastT: number;
  v: number;
  moved: boolean;
}

interface IWorkItemRowProps {
  item: IDemoItem;
  color: string;
  showProject?: string;
}

/**
 * Work item row = Reminders reminder row. Ring toggles done (lingers, then the
 * list hides it); priority marks prefix the title; swipe left for actions with
 * momentum projection + rubber-band, tap anywhere to close.
 */
export function WorkItemRow({ item, color, showProject }: IWorkItemRowProps) {
  // Local demo toggle layered over the item's real status.
  const [toggled, setToggled] = useState(false);
  const flipped: TDemoStatus = item.status === "done" ? "todo" : "done";
  const status = toggled ? flipped : item.status;
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<IDragState | null>(null);
  const done = status === "done";

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, start: offset, lastX: e.clientX, lastT: e.timeStamp, v: 0, moved: false };
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < SLOP) return;
    if (!d.moved) setDragging(true);
    d.moved = true;
    const dt = Math.max(1, e.timeStamp - d.lastT);
    d.v = (e.clientX - d.lastX) / dt;
    d.lastX = e.clientX;
    d.lastT = e.timeStamp;
    let next = d.start + dx;
    if (next > 0) next = rubberband(next);
    if (next < OPEN) next = OPEN - rubberband(OPEN - next);
    setOffset(next);
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (!d) return;
    if (!d.moved) {
      if (offset !== 0) setOffset(0);
      return;
    }
    // Project where the flick is heading (px/ms → px), then snap to the nearest rest.
    const projected = offset + d.v * 160;
    setOffset(projected < OPEN / 2 ? OPEN : 0);
  };

  const meta = [
    item.due ? { text: item.due, color: item.overdue && !done ? ios("destructive") : ios("label-secondary") } : null,
    showProject ? { text: showProject, color } : null,
    item.assignee ? { text: item.assignee, color: ios("label-secondary") } : null,
  ].filter((m): m is { text: string; color: string } => m !== null);

  return (
    <div className="relative overflow-hidden after:absolute after:right-0 after:bottom-0 after:left-[50px] after:h-[0.5px] after:bg-[var(--ios-separator)] last:after:hidden">
      <div className="absolute inset-y-0 right-0 flex" aria-hidden={offset === 0}>
        {ACTIONS.map((a) => (
          <button
            key={a.label}
            type="button"
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => setOffset(0)}
            className="flex flex-col items-center justify-center gap-1 text-white"
            style={{ width: ACTION_W, background: a.color, ...text("caption1"), fontWeight: 500 }}
          >
            <HugeiconsIcon icon={a.icon} size={20} color="#fff" strokeWidth={2} />
            {a.label}
          </button>
        ))}
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="relative flex touch-pan-y items-start gap-3 px-4 py-2.5"
        style={{
          background: ios("surface"),
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 380ms cubic-bezier(0.32, 0.72, 0, 1)",
        }}
      >
        <span className="pt-px">
          <StatusRing status={status} color={color} onToggle={() => setToggled((t) => !t)} />
        </span>
        <span
          className="flex min-w-0 flex-1 flex-col gap-0.5"
          style={{ opacity: done ? 0.45 : 1, transition: "opacity 180ms ease-out" }}
        >
          <span style={{ ...text("body"), color: ios("label") }}>
            {item.priority > 0 ? <span style={{ color }}>{"!".repeat(item.priority)} </span> : null}
            {item.title}
          </span>
          {item.note ? (
            <span className="line-clamp-2" style={{ ...text("subheadline"), color: ios("label-secondary") }}>
              {item.note}
            </span>
          ) : null}
          {meta.length > 0 ? (
            <span style={{ ...text("subheadline") }}>
              {meta.map((m, i) => (
                <span key={m.text} style={{ color: m.color }}>
                  {i > 0 ? <span style={{ color: ios("label-tertiary") }}> · </span> : null}
                  {m.text}
                </span>
              ))}
            </span>
          ) : null}
        </span>
        {item.needsYou ? (
          <HugeiconsIcon icon={Flag02Icon} size={18} color="var(--ios-tint-orange)" strokeWidth={2.2} className="mt-0.5" />
        ) : null}
      </div>
    </div>
  );
}
