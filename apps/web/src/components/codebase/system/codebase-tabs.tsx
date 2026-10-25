"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

/**
 * Top-level Codebase navigation (GIN-408): Repositories · Bundles · Deployments,
 * plus a link back to the existing Codebase Intelligence screen. Styled like the
 * app's other pill tab strips; active state is route-driven.
 */
export function CodebaseTabs({
  workspaceSlug,
  projectId,
}: {
  workspaceSlug: string;
  projectId: string;
}) {
  const pathname = usePathname();
  const base = `/${workspaceSlug}/projects/${projectId}/codebase`;
  const tabs = [
    { label: "Repositories", href: `${base}/repositories` },
    { label: "Bundles", href: `${base}/bundles` },
    { label: "Deployments", href: `${base}/deployments` },
    { label: "Intelligence", href: base },
  ];

  return (
    <nav
      aria-label="Codebase sections"
      className="inline-flex w-fit items-center gap-0.5 rounded-lg border bg-muted/40 p-1"
    >
      {tabs.map((t) => {
        // Intelligence is the bare `/codebase` route — match it exactly so the
        // three sub-routes don't all light it up.
        const active =
          t.href === base ? pathname === base : pathname.startsWith(t.href);
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1 text-sm font-medium transition-colors outline-none",
              "focus-visible:ring-1 focus-visible:ring-ring",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            style={{ transitionTimingFunction: "var(--tabs-ease)", transitionDuration: "200ms" }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
