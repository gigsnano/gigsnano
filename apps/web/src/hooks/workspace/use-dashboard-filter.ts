"use client";

import { createContext, useContext } from "react";

import type { IDashboardFilters } from "@/types";

/**
 * The dashboard-wide filter for every widget on one board.
 *
 * Same seam as `PublicWidgetScopeProvider`: rather than threading the filter
 * through every widget body, the dashboard data hooks read it here and layer it
 * over the widget's own params (`applyDashboardFilters`). Absent = no filter, so
 * the same hooks behave unchanged outside a dashboard.
 */
const DashboardFilterContext = createContext<IDashboardFilters | null>(null);

export const DashboardFilterProvider = DashboardFilterContext.Provider;

export function useDashboardFilter(): IDashboardFilters | null {
  return useContext(DashboardFilterContext);
}
