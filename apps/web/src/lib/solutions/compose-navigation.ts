import {
  DashboardSquare01Icon,
  Bug01Icon,
  Calendar03Icon,
  Layers01Icon,
  GridViewIcon,
  File01Icon,
  FolderGitIcon,
  ShareKnowledgeIcon,
  ShieldKeyIcon,
  Route01Icon,
  Home01Icon,
  Agreement01Icon,
  Invoice01Icon,
  SearchFocusIcon,
  Alert02Icon,
  MoneyReceive01Icon,
  Settings02Icon,
  Audit01Icon,
  Video01Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

import { solutionNavigation } from "@/lib/solutions/registry";
import {
  ESolutionKey,
  type ISolutionDefinition,
  type ISolutionNavigationEntry,
} from "@/types";

import { overviewActivePrefixes, type IProjectPanelRoute } from "@/lib/nav/project-panel-routes";

/**
 * Compose container navigation from the solution definition (GIN-447).
 *
 * Shared GigsNano chrome (My Work, Inbox, …) stays in the workspace panel.
 * This builds only the *container* sub-nav: Software Delivery keeps today's
 * project routes (and progressively adopts Journey), Revenue Assurance gets
 * its own domain entries and must never surface repository/release links.
 */

const NAV_ICONS: Record<string, IconSvgElement> = {
  overview: DashboardSquare01Icon,
  home: Home01Icon,
  journey: Route01Icon,
  "work-items": Bug01Icon,
  cycles: Calendar03Icon,
  modules: Layers01Icon,
  views: GridViewIcon,
  pages: File01Icon,
  meetings: Video01Icon,
  codebase: ShareKnowledgeIcon,
  repository: FolderGitIcon,
  foundation: ShieldKeyIcon,
  "document-import": File01Icon,
  contracts: Agreement01Icon,
  expectations: Invoice01Icon,
  evidence: SearchFocusIcon,
  exceptions: Alert02Icon,
  recoveries: MoneyReceive01Icon,
  controls: Settings02Icon,
  audit: Audit01Icon,
};

/** Software Delivery routes that predate the solution definition and still ship. */
const SOFTWARE_DELIVERY_EXTRA: ISolutionNavigationEntry[] = [
  { key: "pages", label: "Pages", path: "pages", requires_capability: null },
  { key: "meetings", label: "Meetings", path: "meetings", requires_capability: null },
];

/**
 * SD entries that are reachable but no longer Rail B rows: Journey/Views are
 * Overview tabs, setup pages live in project settings (2026-09-24 drill-in).
 */
export const SOFTWARE_DELIVERY_OFF_RAIL_KEYS = new Set([
  "journey",
  "views",
  "document-import",
  "repository",
  "foundation",
]);

/** Canonical SD Rail B order — must match `projectPanelRoutes` so rows never jump
 *  when the solution registry resolves after the fallback list rendered. */
const SOFTWARE_DELIVERY_RAIL_ORDER = [
  "overview",
  "work-items",
  "cycles",
  "modules",
  "pages",
  "meetings",
  "codebase",
];

function railRank(key: string): number {
  const rank = SOFTWARE_DELIVERY_RAIL_ORDER.indexOf(key);
  return rank === -1 ? SOFTWARE_DELIVERY_RAIL_ORDER.length : rank;
}

/**
 * Paths that only Software Delivery owns. A Revenue Assurance deep link into
 * one of these must 403 rather than render the software UI.
 */
export const SOFTWARE_DELIVERY_ONLY_SEGMENTS = new Set([
  "repository",
  "codebase",
  "foundation",
  "journey",
  "document-import",
  "board",
]);

/**
 * Paths that only Revenue Assurance owns. An SD member hitting one gets a
 * safe not-found rather than an empty software page pretending to be assurance.
 */
export const REVENUE_ASSURANCE_ONLY_SEGMENTS = new Set([
  "contracts",
  "expectations",
  "evidence",
  "exceptions",
  "recoveries",
  "controls",
  "audit",
]);

function toRoute(
  workspaceSlug: string,
  containerId: string,
  entry: ISolutionNavigationEntry,
): IProjectPanelRoute {
  const base = `/${workspaceSlug}/projects/${containerId}`;
  const path = entry.path ? `${base}/${entry.path}` : base;
  return {
    label: entry.label,
    path,
    icon: NAV_ICONS[entry.key] ?? File01Icon,
    exact: entry.path === "",
  };
}

/**
 * Build the Rail B rows for a container. Capability filters come from the
 * definition; SD drops its off-rail keys and lights Overview for its tabs.
 */
export function composeContainerNavigation(
  workspaceSlug: string,
  containerId: string,
  solution: ISolutionDefinition,
): IProjectPanelRoute[] {
  let entries = solutionNavigation(solution);
  if (solution.key !== ESolutionKey.SoftwareDelivery) {
    return entries.map((entry) => toRoute(workspaceSlug, containerId, entry));
  }

  const seen = new Set(entries.map((e) => e.key));
  entries = [...entries, ...SOFTWARE_DELIVERY_EXTRA.filter((e) => !seen.has(e.key))]
    .filter((e) => !SOFTWARE_DELIVERY_OFF_RAIL_KEYS.has(e.key))
    // Stable sort: unknown definition keys keep their relative order at the end.
    .sort((a, b) => railRank(a.key) - railRank(b.key));

  const base = `/${workspaceSlug}/projects/${containerId}`;
  return entries.map((entry) => {
    const route = toRoute(workspaceSlug, containerId, entry);
    return route.path === base
      ? { ...route, activePrefixes: overviewActivePrefixes(base) }
      : route;
  });
}

/**
 * Can this solution's members open this container-relative segment?
 * Returns `"allow" | "forbid" | "not_found"`.
 *
 * - `forbid` — the path belongs to another solution (403).
 * - `not_found` — unknown segment (404).
 * - `allow` — shared or owned by this solution.
 */
export function authorizeContainerSegment(
  solutionKey: ESolutionKey,
  segment: string | null,
): "allow" | "forbid" | "not_found" {
  // Container root (overview / assurance home).
  if (!segment) return "allow";

  if (solutionKey === ESolutionKey.SoftwareDelivery) {
    if (REVENUE_ASSURANCE_ONLY_SEGMENTS.has(segment)) return "forbid";
    return "allow";
  }

  if (solutionKey === ESolutionKey.RevenueAssurance) {
    if (SOFTWARE_DELIVERY_ONLY_SEGMENTS.has(segment)) return "forbid";
    if (
      REVENUE_ASSURANCE_ONLY_SEGMENTS.has(segment) ||
      segment === "issues" ||
      segment === "cycles" ||
      segment === "modules" ||
      segment === "views" ||
      segment === "pages" ||
      segment === "settings"
    ) {
      return "allow";
    }
    // Unknown RA segment — treat as not found rather than rendering SD chrome.
    return "not_found";
  }

  return "not_found";
}
