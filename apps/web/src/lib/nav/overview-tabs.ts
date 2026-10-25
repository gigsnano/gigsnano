export type OverviewTabId = "overview" | "journey" | "views";

export interface IOverviewTab {
  id: OverviewTabId;
  label: string;
  href: string;
}

/** Tabs shown in the project header on the Overview family of routes. */
export function overviewTabs(base: string, journeyEnabled: boolean): IOverviewTab[] {
  return [
    { id: "overview", label: "Overview", href: base },
    ...(journeyEnabled
      ? [{ id: "journey" as const, label: "Journey", href: `${base}/journey` }]
      : []),
    { id: "views", label: "Views", href: `${base}/views` },
  ];
}

/** The active tab on a tab root, or null on any other route (tabs hidden). */
export function activeOverviewTab(pathname: string, base: string): OverviewTabId | null {
  if (pathname === base) return "overview";
  if (pathname === `${base}/journey`) return "journey";
  if (pathname === `${base}/views`) return "views";
  return null;
}
