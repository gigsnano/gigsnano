import {
  Alert02Icon,
  ArrowDown01Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import {
  EBundleStatus,
  ERepoAccess,
  ERepoHealth,
  ERepositoryType,
} from "@/types";

export const REPOSITORY_TYPE_LABEL: Record<ERepositoryType, string> = {
  [ERepositoryType.Application]: "Application",
  [ERepositoryType.Service]: "Service",
  [ERepositoryType.Library]: "Library",
  [ERepositoryType.Infrastructure]: "Infrastructure",
  [ERepositoryType.Configuration]: "Configuration",
  [ERepositoryType.Documentation]: "Documentation",
  [ERepositoryType.Other]: "Other",
};

export const REPOSITORY_TYPE_OPTIONS = Object.values(ERepositoryType);

export const ACCESS_LABEL: Record<ERepoAccess, string> = {
  [ERepoAccess.Write]: "Write",
  [ERepoAccess.Reference]: "Reference",
};

/** Health meta — icon + label so status never depends on colour alone (a11y NFR). */
export const HEALTH_META: Record<
  ERepoHealth,
  { label: string; icon: IconSvgElement; tone: string; spin?: boolean }
> = {
  [ERepoHealth.Ready]: {
    label: "Ready",
    icon: CheckmarkCircle02Icon,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  [ERepoHealth.Behind]: {
    label: "Behind",
    icon: ArrowDown01Icon,
    tone: "text-amber-600 dark:text-amber-400",
  },
  [ERepoHealth.Syncing]: {
    label: "Syncing",
    icon: RefreshIcon,
    tone: "text-sky-600 dark:text-sky-400",
    spin: true,
  },
  [ERepoHealth.Error]: {
    label: "Error",
    icon: Alert02Icon,
    tone: "text-destructive",
  },
};

export const BUNDLE_STATUS_META: Record<
  EBundleStatus,
  { label: string; icon: IconSvgElement; tone: string }
> = {
  [EBundleStatus.Valid]: {
    label: "Valid",
    icon: CheckmarkCircle02Icon,
    tone: "text-emerald-600 dark:text-emerald-400",
  },
  [EBundleStatus.Draft]: {
    label: "Draft",
    icon: ArrowDown01Icon,
    tone: "text-muted-foreground",
  },
  [EBundleStatus.Invalid]: {
    label: "Invalid",
    icon: Alert02Icon,
    tone: "text-destructive",
  },
  [EBundleStatus.Archived]: {
    label: "Archived",
    icon: ArrowDown01Icon,
    tone: "text-muted-foreground",
  },
};
