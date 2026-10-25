import {
  CircleIcon,
  Loading03Icon,
  PieChartIcon,
  CheckmarkCircle02Icon,
  Alert02Icon,
  Layers01Icon,
  SparklesIcon,
  File01Icon,
  CheckmarkSquare01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { EStoryStatus, EStoryPriority, EStoryType } from "@/types";

/** Display metadata for a work-item status (icon + label + tokenized colors). */
export interface IStatusMeta {
  label: string;
  icon: IconSvgElement;
  /** Foreground/icon color class. */
  color: string;
  /** Solid fill (kanban bar, progress segment). */
  fill: string;
  /** Soft background chip. */
  chip: string;
}

export const STORY_STATUS_ORDER: EStoryStatus[] = [
  EStoryStatus.Todo,
  EStoryStatus.InProgress,
  EStoryStatus.InReview,
  EStoryStatus.Done,
];

export const STORY_STATUS_META: Record<EStoryStatus, IStatusMeta> = {
  [EStoryStatus.Todo]: {
    label: "To do",
    icon: CircleIcon,
    color: "text-muted-foreground",
    fill: "bg-muted-foreground/40",
    chip: "bg-muted text-muted-foreground",
  },
  [EStoryStatus.InProgress]: {
    label: "In progress",
    icon: Loading03Icon,
    color: "text-blue-500",
    fill: "bg-blue-500",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  [EStoryStatus.InReview]: {
    label: "In review",
    icon: PieChartIcon,
    color: "text-amber-500",
    fill: "bg-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  [EStoryStatus.Done]: {
    label: "Done",
    icon: CheckmarkCircle02Icon,
    color: "text-emerald-500",
    fill: "bg-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

/**
 * Per-status colours as raw CSS values, for SVG `stroke`/`fill` and inline styles.
 *
 * `STORY_STATUS_META.fill` is a `bg-*` class, which SVG can't use — hence this
 * parallel map. Every chart keying on status shares it, so a status is the same
 * colour in the donut as in the activity chart as on the board.
 *
 * Deliberately NOT `--chart-1..5`: that ramp is monochrome (near-zero chroma), so
 * four series drawn from it are four greys and the middle two are indistinguishable.
 */
export const STORY_STATUS_STROKE: Record<EStoryStatus, string> = {
  [EStoryStatus.Todo]: "var(--color-muted-foreground)",
  [EStoryStatus.InProgress]: "var(--color-blue-500, #3b82f6)",
  [EStoryStatus.InReview]: "var(--color-amber-500, #f59e0b)",
  [EStoryStatus.Done]: "var(--color-green-500, #22c55e)",
};

/** Display metadata for a work-item priority. `bars` drives the signal glyph. */
export interface IPriorityMeta {
  label: string;
  /** Number of filled signal bars (0–3); Urgent uses the alert icon instead. */
  bars: number;
  urgent?: boolean;
  color: string;
  chip: string;
}

export const STORY_PRIORITY_ORDER: EStoryPriority[] = [
  EStoryPriority.Urgent,
  EStoryPriority.High,
  EStoryPriority.Medium,
  EStoryPriority.Low,
  EStoryPriority.None,
];

/** Sort weight — higher = more urgent, for order-by-priority. */
export const PRIORITY_WEIGHT: Record<EStoryPriority, number> = {
  [EStoryPriority.Urgent]: 4,
  [EStoryPriority.High]: 3,
  [EStoryPriority.Medium]: 2,
  [EStoryPriority.Low]: 1,
  [EStoryPriority.None]: 0,
};

export const STORY_PRIORITY_META: Record<EStoryPriority, IPriorityMeta> = {
  [EStoryPriority.Urgent]: {
    label: "Urgent",
    bars: 3,
    urgent: true,
    color: "text-red-600 dark:text-red-400",
    chip: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  },
  [EStoryPriority.High]: {
    label: "High",
    bars: 3,
    color: "text-orange-500",
    chip: "bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-500/25",
  },
  [EStoryPriority.Medium]: {
    label: "Medium",
    bars: 2,
    color: "text-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/25",
  },
  [EStoryPriority.Low]: {
    label: "Low",
    bars: 1,
    color: "text-blue-500",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/25",
  },
  [EStoryPriority.None]: {
    label: "None",
    bars: 0,
    color: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground border-border",
  },
};

/** Display metadata for a work-item type. */
export interface ITypeMeta {
  label: string;
  icon: IconSvgElement;
  color: string;
  chip: string;
}

export const STORY_TYPE_ORDER: EStoryType[] = [
  EStoryType.Epic,
  EStoryType.Feature,
  EStoryType.Story,
  EStoryType.Task,
  EStoryType.Bug,
];

export const STORY_TYPE_META: Record<EStoryType, ITypeMeta> = {
  [EStoryType.Epic]: {
    label: "Epic",
    icon: Layers01Icon,
    color: "text-violet-500",
    chip: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/25",
  },
  [EStoryType.Feature]: {
    label: "Feature",
    icon: SparklesIcon,
    color: "text-indigo-500",
    chip: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/25",
  },
  [EStoryType.Story]: {
    label: "Story",
    icon: File01Icon,
    color: "text-sky-500",
    chip: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/25",
  },
  [EStoryType.Task]: {
    label: "Task",
    icon: CheckmarkSquare01Icon,
    color: "text-slate-500",
    chip: "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/25",
  },
  [EStoryType.Bug]: {
    label: "Bug",
    icon: Alert02Icon,
    color: "text-rose-500",
    chip: "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/25",
  },
};

export { Alert02Icon as UrgentIcon };
