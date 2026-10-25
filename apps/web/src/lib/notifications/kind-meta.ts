import type { IconSvgElement } from "@hugeicons/react";
import {
  AtIcon,
  UserIcon,
  Rocket01Icon,
  Settings02Icon,
  Notification01Icon,
  CheckmarkBadge01Icon,
  Robot01Icon,
} from "@hugeicons/core-free-icons";

import { ENotificationKind } from "@/types";

/**
 * GIN-270: each backend notification `kind` maps to a stable icon, an accessible
 * type label, and a token-based tint. The label is always rendered (visibly or
 * via aria) so type is never communicated by color/icon alone (WCAG 2.2).
 * Tints use design tokens only — never hardcoded colors.
 */
export interface INotificationKindMeta {
  icon: IconSvgElement;
  label: string;
  tint: string;
}

// Tint carries only secondary emphasis — the distinct icon + label are what
// communicate type (never color alone). Tokens only, no raw color classes.
const META: Record<ENotificationKind, INotificationKindMeta> = {
  [ENotificationKind.Mention]: { icon: AtIcon, label: "Mention", tint: "bg-primary/10 text-primary" },
  [ENotificationKind.Assignment]: { icon: UserIcon, label: "Assignment", tint: "bg-primary/10 text-primary" },
  [ENotificationKind.Sprint]: { icon: Rocket01Icon, label: "Sprint", tint: "bg-primary/10 text-primary" },
  [ENotificationKind.System]: { icon: Settings02Icon, label: "System", tint: "bg-muted text-muted-foreground" },
  [ENotificationKind.Review]: { icon: CheckmarkBadge01Icon, label: "Review", tint: "bg-primary/10 text-primary" },
  [ENotificationKind.Agent]: { icon: Robot01Icon, label: "Agent", tint: "bg-primary/10 text-primary" },
};

export function notificationKindMeta(kind: ENotificationKind): INotificationKindMeta {
  return META[kind] ?? { icon: Notification01Icon, label: "Notification", tint: "bg-muted text-muted-foreground" };
}
