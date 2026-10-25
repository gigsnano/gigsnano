import { BriefcaseDollarIcon, Rocket01Icon } from "@hugeicons/core-free-icons";

import { ESolutionKey } from "@/types";

/**
 * Presentation for each solution (GIN-446). Copy, capabilities and availability
 * are backend data on `ISolutionDefinition` — only the things that cannot travel
 * over JSON live here, keyed by the immutable solution key.
 */

type TSolutionPresentation = {
  icon: typeof Rocket01Icon;
  /** Tint for the card's icon tile. Semantic tokens only, never the accent. */
  tile: string;
};

export const SOLUTION_PRESENTATION: Record<ESolutionKey, TSolutionPresentation> = {
  [ESolutionKey.SoftwareDelivery]: {
    icon: Rocket01Icon,
    tile: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  [ESolutionKey.RevenueAssurance]: {
    icon: BriefcaseDollarIcon,
    tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
};

/** Fallback so an unknown key from a newer backend still renders a card. */
export const DEFAULT_SOLUTION_PRESENTATION: TSolutionPresentation = {
  icon: Rocket01Icon,
  tile: "bg-muted text-muted-foreground",
};

export function solutionPresentation(key: string): TSolutionPresentation {
  return SOLUTION_PRESENTATION[key as ESolutionKey] ?? DEFAULT_SOLUTION_PRESENTATION;
}

export const SOLUTION_CHOOSER_COPY = {
  title: "What outcome do you want?",
  description: "Pick the outcome. We generate the setup, and you review it before anything is created.",
  compareSummary: "Learn what changes",
} as const;
