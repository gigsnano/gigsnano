import {
  CircleIcon,
  PlayIcon,
  Loading03Icon,
  HelpCircleIcon,
  ViewIcon,
  CircleLock01Icon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock01Icon,
  MinusSignIcon,
  UserIcon,
  SparklesIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { EStepState, EExecutor } from "@/types";

export interface IStepStateMeta {
  label: string;
  icon: IconSvgElement;
  /** Icon/foreground color class. */
  color: string;
  /** Soft background chip. */
  chip: string;
}

export const STEP_STATE_META: Record<EStepState, IStepStateMeta> = {
  [EStepState.NotStarted]: {
    label: "Not started",
    icon: CircleIcon,
    color: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
  [EStepState.Ready]: {
    label: "Ready",
    icon: PlayIcon,
    color: "text-primary",
    chip: "bg-primary/10 text-primary",
  },
  [EStepState.InProgress]: {
    label: "In progress",
    icon: Loading03Icon,
    color: "text-blue-500",
    chip: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  [EStepState.NeedsInput]: {
    label: "Needs input",
    icon: HelpCircleIcon,
    color: "text-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  [EStepState.ReviewRequired]: {
    label: "Review required",
    icon: ViewIcon,
    color: "text-amber-500",
    chip: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  [EStepState.Blocked]: {
    label: "Blocked",
    icon: CircleLock01Icon,
    color: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
  [EStepState.Failed]: {
    label: "Failed",
    icon: Cancel01Icon,
    color: "text-red-600 dark:text-red-400",
    chip: "bg-red-500/10 text-red-600 dark:text-red-400",
  },
  [EStepState.Verified]: {
    label: "Verified",
    icon: CheckmarkCircle02Icon,
    color: "text-emerald-500",
    chip: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  [EStepState.Superseded]: {
    label: "Superseded",
    icon: Clock01Icon,
    color: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground",
  },
  [EStepState.Skipped]: {
    label: "Skipped",
    icon: MinusSignIcon,
    color: "text-muted-foreground",
    chip: "bg-muted text-muted-foreground line-through",
  },
};

export const EXECUTOR_META: Record<EExecutor, { label: string; icon: IconSvgElement }> = {
  [EExecutor.Self]: { label: "You", icon: UserIcon },
  [EExecutor.Team]: { label: "Team", icon: UserIcon },
  [EExecutor.Expert]: { label: "Expert", icon: UserIcon },
  [EExecutor.Ai]: { label: "AI agent", icon: SparklesIcon },
};
