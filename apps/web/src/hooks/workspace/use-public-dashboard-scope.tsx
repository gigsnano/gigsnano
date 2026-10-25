"use client";

import { createContext, useContext } from "react";

/**
 * Marks the subtree of one widget on a *public* dashboard (GIN-489).
 *
 * The public page reuses the ordinary widget bodies unchanged. Rather than
 * teaching every body about anonymous access, the data hooks it calls
 * (`useDashboardMetrics`, `useDashboardActivity`, `useWorkspaceAnalytics`) look
 * for this scope and, when present, fetch from the token-scoped public endpoints
 * instead of the workspace ones. Absent scope = the normal authenticated path,
 * so nothing changes inside the app.
 */
export interface IPublicWidgetScope {
  token: string;
  widgetId: string;
}

const PublicWidgetScopeContext = createContext<IPublicWidgetScope | null>(null);

export const PublicWidgetScopeProvider = PublicWidgetScopeContext.Provider;

export function usePublicWidgetScope(): IPublicWidgetScope | null {
  return useContext(PublicWidgetScopeContext);
}
