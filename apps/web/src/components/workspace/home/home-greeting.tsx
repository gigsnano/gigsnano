"use client";

import { useAuthUser } from "@/hooks/auth/use-auth";
import { greetingFor, greetingEmoji, formatHomeDate } from "@/lib/home/home-greeting";

/**
 * Personalized, time-aware greeting — the launchpad's opening line.
 * Rendered client-side only (behind the home's query gate), so the local clock
 * is authoritative; `suppressHydrationWarning` covers the SSR edge. The two
 * lines rise in with the shared texts-reveal stagger (`.t-stagger-line`).
 */
export function HomeGreeting() {
  const { data: user } = useAuthUser();
  const now = new Date();
  const first = user?.display_name?.trim().split(/\s+/)[0] ?? "there";

  return (
    <header className="flex flex-col items-center gap-1 pt-2 text-center sm:pt-6">
      <h1
        suppressHydrationWarning
        className="t-stagger-line text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]"
      >
        {greetingFor(now)}, {first}
      </h1>
      <p suppressHydrationWarning className="t-stagger-line text-sm text-muted-foreground">
        <span className="mr-1.5" aria-hidden>
          {greetingEmoji(now)}
        </span>
        {formatHomeDate(now)}
      </p>
    </header>
  );
}
