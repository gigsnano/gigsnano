"use client";

import { EmptyState } from "@/components/empty-state";

/** App Router error boundary — catches uncaught render/data errors below the root. */
export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center">
      <EmptyState
        assetKey="error"
        title="Something went wrong"
        description="We couldn't load this page. Try again, and if it keeps happening, refresh."
        actions={[{ label: "Try again", onClick: reset }]}
      />
    </main>
  );
}
