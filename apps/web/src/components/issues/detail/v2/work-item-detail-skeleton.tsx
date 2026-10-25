/**
 * Loading state for the redesigned work-item page (GIN-479).
 *
 * It mirrors the shell — header band, tab bar, content rows, properties rail —
 * because the thing it replaces (`h-32 rounded-lg border bg-muted`) guaranteed a
 * layout shift on every open: nothing about a 128px block predicts the page that
 * lands on top of it.
 */
export function WorkItemDetailSkeleton() {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden" aria-hidden>
      {/* header — 68px, matching the real one */}
      <div className="flex h-[68px] shrink-0 items-center gap-3 border-b px-6">
        <div className="h-4 w-16 animate-pulse rounded bg-muted" />
        <div className="h-5 w-72 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-7 w-24 animate-pulse rounded-md bg-muted" />
      </div>

      {/* tab bar — 46px */}
      <div className="flex h-[46px] shrink-0 items-center gap-4 border-b px-6">
        {[64, 44, 62, 56].map((w) => (
          <div key={w} className="h-3.5 animate-pulse rounded bg-muted" style={{ width: w }} />
        ))}
      </div>

      <div className="flex min-h-0 flex-1 gap-6 px-6 py-6">
        <div className="min-w-0 flex-1 space-y-4">
          <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="h-4 w-full animate-pulse rounded bg-muted" />
          <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
          <div className="h-24 w-full animate-pulse rounded-lg bg-muted" />
        </div>
        <div className="hidden w-80 shrink-0 space-y-3 xl:block">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-7 w-full animate-pulse rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
