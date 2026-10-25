import {
  Home01Icon,
  FileEditIcon,
  Target01Icon,
  StickyNote01Icon,
  Folder01Icon,
  GridViewIcon,
  Analytics01Icon,
  Archive01Icon,
  Notification01Icon,
  InboxIcon,
  UserGroupIcon,
  Route01Icon,
  Copy01Icon,
  UserSquareIcon,
  DashboardSquare01Icon,
  Clock01Icon,
  Delete02Icon,
} from "@hugeicons/core-free-icons";
import type { IconSvgElement } from "@hugeicons/react";

export interface ISidebarNavItem {
  /** Stable key used by the store. */
  id: string;
  label: string;
  icon: IconSvgElement;
  /** Builds the href from the workspace base (`/${workspaceSlug}`). */
  href: (base: string) => string;
  /** When true, active-match is exact; otherwise prefix match. */
  exact?: boolean;
}

export interface ISidebarPref {
  id: string;
  pinned: boolean;
}

/** Fixed top anchor of the Personal group — never toggleable. */
export const PERSONAL_ANCHOR: ISidebarNavItem = {
  id: "home",
  label: "Home",
  icon: Home01Icon,
  href: (base) => base,
  exact: true,
};

/** Fixed top anchor of the Workspace group — never toggleable. */
export const WORKSPACE_ANCHOR: ISidebarNavItem = {
  id: "projects",
  label: "Projects",
  icon: Folder01Icon,
  href: (base) => `${base}/projects`,
  exact: true,
};

/** Toggleable Personal items — order + pinned state live in the store. */
export const PERSONAL_ITEMS: ISidebarNavItem[] = [
  { id: "inbox", label: "Inbox", icon: Notification01Icon, href: (b) => `${b}/notifications` },
  { id: "drafts", label: "Drafts", icon: FileEditIcon, href: (b) => `${b}/drafts` },
  { id: "your-work", label: "Your work", icon: Target01Icon, href: (b) => `${b}/work-items` },
  { id: "stickies", label: "Stickies", icon: StickyNote01Icon, href: (b) => `${b}/stickies` },
];

/** Toggleable Workspace items. */
export const WORKSPACE_ITEMS: ISidebarNavItem[] = [
  { id: "intake", label: "Intake", icon: InboxIcon, href: (b) => `${b}/intake` },
  { id: "customers", label: "Customers", icon: UserGroupIcon, href: (b) => `${b}/customers` },
  { id: "roadmap", label: "Roadmap", icon: Route01Icon, href: (b) => `${b}/roadmap` },
  { id: "templates", label: "Templates", icon: Copy01Icon, href: (b) => `${b}/templates` },
  { id: "persona", label: "Persona 360", icon: UserSquareIcon, href: (b) => `${b}/persona` },
  { id: "dashboards", label: "Dashboards", icon: DashboardSquare01Icon, href: (b) => `${b}/dashboards` },
  { id: "views", label: "Views", icon: GridViewIcon, href: (b) => `${b}/views` },
  { id: "analytics", label: "Analytics", icon: Analytics01Icon, href: (b) => `${b}/analytics` },
  { id: "time", label: "Time", icon: Clock01Icon, href: (b) => `${b}/time` },
  { id: "archives", label: "Archives", icon: Archive01Icon, href: (b) => `${b}/archives` },
  { id: "trash", label: "Trash", icon: Delete02Icon, href: (b) => `${b}/trash` },
];

/**
 * Workspace items pinned by default in a fresh workspace / for a user with no
 * saved nav prefs (GIN-316). Everything else — Intake, Customers, Roadmap, and
 * any future item — starts unpinned, discoverable from the "More" menu. An
 * explicit allowlist (not "pin everything") keeps new sidebars uncluttered and
 * makes future items default-off unless deliberately added here.
 */
export const ESSENTIAL_WORKSPACE_IDS: ReadonlySet<string> = new Set([
  "dashboards",
  "views",
  "analytics",
  "trash",
]);

/**
 * Reconcile a stored pref list against the catalog. Also the seeding function
 * (call with `undefined` for defaults):
 *  - drop stored ids no longer in the catalog,
 *  - append catalog items missing from the store,
 *  - preserve stored order + pinned for surviving ids.
 *
 * Appended (never-seen) items start pinned unless `defaultPinnedIds` is given, in
 * which case only listed ids start pinned (GIN-316). Existing stored prefs are
 * always preserved, so this never overwrites a user's customization.
 */
export function reconcilePrefs(
  stored: ISidebarPref[] | undefined,
  catalog: ISidebarNavItem[],
  defaultPinnedIds?: ReadonlySet<string>,
): ISidebarPref[] {
  const valid = new Set(catalog.map((c) => c.id));
  const kept = (stored ?? []).filter((p) => valid.has(p.id));
  const seen = new Set(kept.map((p) => p.id));
  const appended: ISidebarPref[] = [];
  for (const item of catalog) {
    if (!seen.has(item.id)) {
      appended.push({
        id: item.id,
        pinned: defaultPinnedIds ? defaultPinnedIds.has(item.id) : true,
      });
    }
  }
  return [...kept, ...appended];
}

/** Split a reconciled pref list into pinned (visible) + overflow ("More"). */
export function splitPinned(
  prefs: ISidebarPref[],
  catalog: ISidebarNavItem[],
): { pinned: ISidebarNavItem[]; overflow: ISidebarNavItem[] } {
  const byId = new Map(catalog.map((c) => [c.id, c] as const));
  const pinned: ISidebarNavItem[] = [];
  const overflow: ISidebarNavItem[] = [];
  for (const p of prefs) {
    const item = byId.get(p.id);
    if (!item) continue;
    (p.pinned ? pinned : overflow).push(item);
  }
  return { pinned, overflow };
}

/** Clamp the project-limit input to a sane range; fall back to 10 for junk. */
export function clampProjectLimit(n: number): number {
  if (!Number.isFinite(n)) return 10;
  return Math.min(100, Math.max(1, Math.floor(n)));
}
