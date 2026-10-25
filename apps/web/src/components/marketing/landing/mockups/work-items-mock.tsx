"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  Menu01Icon,
  KanbanIcon,
  Calendar03Icon,
  GridViewIcon,
  ChartGanttIcon,
  FilterIcon,
  PreferenceHorizontalIcon,
  Add01Icon,
} from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

const LAYOUTS = [
  { icon: Menu01Icon, label: "List" },
  { icon: KanbanIcon, label: "Board" },
  { icon: Calendar03Icon, label: "Calendar" },
  { icon: GridViewIcon, label: "Spreadsheet" },
  { icon: ChartGanttIcon, label: "Gantt" },
];

type Item = {
  id: string;
  title: string;
  pr: string;
  prLabel: string;
  status: "todo" | "active" | "done";
  who: string;
  wc: string;
  date: string;
  group: "Todo" | "In progress" | "Done";
  span: [number, number];
};

const ITEMS: Item[] = [
  { id: "GIN-42", title: "Sprint-0 seed logic", pr: "#ff5c8a", prLabel: "Urgent", status: "active", who: "AN", wc: "#ff5c8a", date: "Mar 4", group: "In progress", span: [0.05, 0.4] },
  { id: "GIN-38", title: "Board drag-and-drop", pr: "#ffb224", prLabel: "High", status: "active", who: "DV", wc: "#3b96ff", date: "Mar 6", group: "In progress", span: [0.25, 0.6] },
  { id: "GIN-51", title: "Doc viewer comments", pr: "#3b96ff", prLabel: "Medium", status: "todo", who: "UX", wc: "#f472b6", date: "Mar 9", group: "Todo", span: [0.45, 0.78] },
  { id: "GIN-53", title: "Exports XLSX writer", pr: "#3ecf8e", prLabel: "Low", status: "todo", who: "QA", wc: "#22d3ee", date: "—", group: "Todo", span: [0.6, 0.95] },
  { id: "GIN-30", title: "Auth refresh rotation", pr: "#a78bfa", prLabel: "High", status: "done", who: "AR", wc: "#a78bfa", date: "Mar 1", group: "Done", span: [0.0, 0.2] },
];

const CAL_EVENTS: Record<number, string> = {
  1: "#a78bfa",
  4: "#ff5c8a",
  6: "#ffb224",
  9: "#3b96ff",
  12: "#3ecf8e",
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const byGroup = (g: Item["group"]) => ITEMS.filter((it) => it.group === g);

function StatusDot({ status }: { status: Item["status"] }) {
  return (
    <span
      className={cn(
        "lp-mk-status",
        status === "active" && "lp-mk-status--active",
        status === "done" && "lp-mk-status--done",
      )}
    />
  );
}

function Avatar({ who, color, size = 1.4 }: { who: string; color: string; size?: number }) {
  return (
    <span
      className="lp-mk-avatar"
      style={{ "--lp-local": color, width: `${size}rem`, height: `${size}rem` } as CSSProperties}
    >
      {who}
    </span>
  );
}

/**
 * Interactive recreation of the real Work Items view (`components/issues/*`):
 * the segmented 5-layout switcher is clickable, with a sliding pill and
 * cross-faded panes for List, Board, Calendar, Spreadsheet, and Gantt — a live
 * "see your work five ways" demo. Landing tokens throughout.
 */
export function WorkItemsMock() {
  const [active, setActive] = useState(0);

  return (
    <div className="lp-window">
      <div className="lp-window__bar">
        <div className="lp-mk-seg" style={{ "--i": active } as CSSProperties}>
          <span className="lp-mk-seg__pill" aria-hidden />
          {LAYOUTS.map((layout, i) => (
            <button
              key={layout.label}
              type="button"
              aria-label={layout.label}
              aria-pressed={i === active}
              onClick={() => setActive(i)}
              className={cn("lp-mk-segbtn", i === active && "lp-mk-segbtn--on")}
            >
              <HugeiconsIcon icon={layout.icon} className="size-3.5" aria-hidden />
            </button>
          ))}
        </div>
        <span className="ml-auto flex items-center gap-2 text-[var(--lp-ink-faint)]">
          <HugeiconsIcon icon={FilterIcon} className="size-3.5" aria-hidden />
          <HugeiconsIcon icon={PreferenceHorizontalIcon} className="size-3.5" aria-hidden />
          <span
            className="ml-0.5 inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.7rem] font-medium text-white"
            style={{ background: "var(--lp-accent-bright)" }}
          >
            <HugeiconsIcon icon={Add01Icon} className="size-3" aria-hidden />
            Add
          </span>
        </span>
      </div>

      <div className="lp-window__body">
        <div className="lp-mkview">
          {/* ── List ── */}
          <div className="lp-mkview__pane" data-active={active === 0}>
            {(["In progress", "Todo"] as const).map((group) => (
              <div key={group} className="mt-2 first:mt-0">
                <p className="flex items-center gap-1.5 py-1.5">
                  <span className="lp-mono text-[var(--lp-ink-dim)]">{group}</span>
                  <span className="lp-mk-chip lp-mono">{byGroup(group).length}</span>
                </p>
                {byGroup(group).map((it) => (
                  <div key={it.id} className="lp-mk-issue">
                    <span className="size-1.5 shrink-0 rounded-full" style={{ background: it.pr }} />
                    <StatusDot status={it.status} />
                    <span className="lp-mono w-12 shrink-0 text-[var(--lp-ink-faint)]">{it.id}</span>
                    <span className="min-w-0 flex-1 truncate text-[0.8rem] text-[var(--lp-ink)]">
                      {it.title}
                    </span>
                    <span className="lp-mono hidden shrink-0 text-[var(--lp-ink-faint)] sm:block">
                      {it.date}
                    </span>
                    <Avatar who={it.who} color={it.wc} />
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* ── Board ── */}
          <div className="lp-mkview__pane" data-active={active === 1}>
            <div className="lp-mk-board">
              {(["Todo", "In progress", "Done"] as const).map((col) => (
                <div key={col}>
                  <p className="lp-mk-bcol__hd lp-mono">
                    {col}
                    <span className="lp-mk-chip lp-mono">{byGroup(col).length}</span>
                  </p>
                  {byGroup(col).map((it) => (
                    <div key={it.id} className="lp-mk-bcard">
                      <div className="flex items-center gap-1.5">
                        <span className="size-1.5 rounded-full" style={{ background: it.pr }} />
                        <span className="lp-mono text-[var(--lp-ink-faint)]">{it.id}</span>
                      </div>
                      <p className="mt-1 text-[0.72rem] leading-snug text-[var(--lp-ink)]">
                        {it.title}
                      </p>
                      <div className="mt-1.5 flex justify-end">
                        <Avatar who={it.who} color={it.wc} size={1.15} />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* ── Calendar ── */}
          <div className="lp-mkview__pane" data-active={active === 2}>
            <div className="mb-1.5 grid grid-cols-7 gap-[3px] text-center">
              {WEEKDAYS.map((d) => (
                <span key={d} className="lp-mono text-[var(--lp-ink-faint)]">
                  {d}
                </span>
              ))}
            </div>
            <div className="lp-mk-cal">
              {Array.from({ length: 21 }, (_, i) => {
                const day = i + 1;
                const ev = CAL_EVENTS[day];
                return (
                  <div key={day} className="lp-mk-cal__cell">
                    <span className="lp-mono">{day}</span>
                    {ev ? (
                      <span
                        className="lp-mk-cal__ev block"
                        style={{ "--lp-local": ev } as CSSProperties}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── Spreadsheet ── */}
          <div className="lp-mkview__pane" data-active={active === 3}>
            <div className="lp-mk-trow lp-mk-trow--head lp-mono">
              <span>Work item</span>
              <span>Status</span>
              <span>Priority</span>
              <span>Owner</span>
              <span>Due</span>
            </div>
            {ITEMS.map((it) => (
              <div key={it.id} className="lp-mk-trow text-[0.74rem] text-[var(--lp-ink-dim)]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="lp-mono shrink-0 text-[var(--lp-ink-faint)]">{it.id}</span>
                  <span className="truncate text-[var(--lp-ink)]">{it.title}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <StatusDot status={it.status} />
                  <span className="truncate">{it.group}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full" style={{ background: it.pr }} />
                  {it.prLabel}
                </span>
                <Avatar who={it.who} color={it.wc} size={1.25} />
                <span className="lp-mono">{it.date}</span>
              </div>
            ))}
          </div>

          {/* ── Gantt ── */}
          <div className="lp-mkview__pane" data-active={active === 4}>
            <div className="mt-1 space-y-0.5">
              {ITEMS.map((it) => (
                <div key={it.id} className="lp-mk-grow">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span className="lp-mono shrink-0 text-[var(--lp-ink-faint)]">{it.id}</span>
                    <span className="truncate text-[0.72rem] text-[var(--lp-ink-dim)]">
                      {it.title}
                    </span>
                  </span>
                  <span className="lp-mk-gtrack">
                    <span
                      className="lp-mk-gbar"
                      style={
                        {
                          "--lp-local": it.pr,
                          left: `${it.span[0] * 100}%`,
                          width: `${(it.span[1] - it.span[0]) * 100}%`,
                        } as CSSProperties
                      }
                    />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
