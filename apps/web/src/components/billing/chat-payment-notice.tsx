"use client";

import Link from "next/link";

export function ChatPaymentNotice({ workspaceSlug }: { workspaceSlug: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-2.5 py-1.5 text-xs text-amber-900 dark:text-amber-200">
      <span>Insufficient wallet balance — top up to continue using AI.</span>
      <Link
        href={`/${workspaceSlug}/settings/billing`}
        className="shrink-0 font-medium underline underline-offset-2 transition-opacity hover:opacity-80"
      >
        Top up
      </Link>
    </div>
  );
}
