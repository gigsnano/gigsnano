"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { Globe02Icon } from "@hugeicons/core-free-icons";

import { usePublicDashboard } from "@/hooks/workspace/use-dashboards";
import { PublicWidgetScopeProvider } from "@/hooks/workspace/use-public-dashboard-scope";
import { DashboardFilterProvider } from "@/hooks/workspace/use-dashboard-filter";
import { dashboardWindow } from "@/lib/dashboards/widget-filters";
import { dateFilterLabel } from "@/lib/dashboards/date-filter-label";
import { WidgetFrame } from "@/components/dashboards/widgets/widget-frame";
import type { IDashboardWidget, IPublicDashboardWidget } from "@/types";

const noop = () => {};

/**
 * A published dashboard, for visitors who are not signed in (GIN-489).
 *
 * Deliberately not the app shell: no sidebar, account menu, balance,
 * notifications or GigsAI. Widgets are the ordinary bodies rendered read-only —
 * each wrapped in a scope that points its data hooks at the token-scoped public
 * endpoints, so nothing here can reach a workspace API.
 */
export function PublicDashboardView({ token }: { token: string }) {
  const { data, isPending, isError, refetch } = usePublicDashboard(token);

  if (isPending) {
    return (
      // Distinct keys: React would otherwise reuse this node for the error state
      // and the browser would count the resize as a layout shift.
      <div key="loading" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
        <div className="h-8 w-64 max-w-full animate-pulse rounded bg-muted" />
        <div className="mt-6 grid grid-cols-12 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="col-span-12 h-56 animate-pulse rounded-xl bg-muted sm:col-span-4" />
          ))}
        </div>
      </div>
    );
  }

  // One message for every failure — unknown, revoked or rotated link. Anonymous
  // visitors are never bounced to a login screen.
  if (isError || !data) {
    return (
      <div key="unavailable" className="mx-auto flex w-full max-w-md flex-col items-center gap-3 px-6 py-24 text-center">
        <h1 className="text-lg font-semibold">This dashboard is unavailable</h1>
        <p className="text-sm text-muted-foreground">
          The link may have been disabled or replaced. Ask whoever shared it for a new one.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-1 rounded-md border px-3 py-1.5 text-sm transition-colors hover:bg-muted"
        >
          Try again
        </button>
      </div>
    );
  }

  const widgets = [...data.widgets].sort((a, b) => a.y - b.y || a.x - b.x);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 border-b pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">GigsNano</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <HugeiconsIcon icon={Globe02Icon} className="size-3.5" />
            Public dashboard
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight">{data.name}</h1>
        {data.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{data.description}</p>
        ) : null}
        <p className="mt-2 text-xs text-muted-foreground">
          Last updated <LastUpdated iso={data.updated_at} />
          {dashboardWindow(data.filters) && data.filters ? (
            <> · Showing {dateFilterLabel(data.filters).toLowerCase()}</>
          ) : null}
        </p>
      </header>

      {widgets.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          This dashboard has nothing to show yet.
        </p>
      ) : (
        // The board's date window; its project filter is applied server-side.
        <DashboardFilterProvider value={data.filters ?? null}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          {widgets.map((widget) => (
            <div
              key={widget.id}
              className="md:[grid-column:span_var(--w)]"
              style={
                {
                  "--w": Math.min(Math.max(widget.w, 3), 12),
                  minHeight: `${Math.max(widget.h, 2) * 56}px`,
                } as React.CSSProperties
              }
            >
              <PublicWidgetScopeProvider value={{ token, widgetId: widget.id }}>
                <WidgetFrame
                  widget={toWidget(widget)}
                  ctx={{ workspaceSlug: "" }}
                  editable={false}
                  onRemove={noop}
                  onUpdateSettings={noop}
                />
              </PublicWidgetScopeProvider>
            </div>
          ))}
        </div>
        </DashboardFilterProvider>
      )}
    </div>
  );
}

/** The public payload is an IDashboardWidget minus the stripped filters, which
 *  the bodies treat as "unfiltered" — the real filters are applied server-side. */
const toWidget = (widget: IPublicDashboardWidget): IDashboardWidget => widget;

function LastUpdated({ iso }: { iso: string }) {
  // Rendered from the client only: a server-rendered locale string would
  // disagree with the visitor's timezone and trip hydration.
  return <span suppressHydrationWarning>{new Date(iso).toLocaleString()}</span>;
}
