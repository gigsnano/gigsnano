"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";
import { Search01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileNavLink, MobileNavSheet } from "@/components/layout/mobile-nav-sheet";
import { useIsClient } from "@/hooks/ui/use-is-client";
import { useMarketplaceProfileStore } from "@/store/ui/marketplace-profile.store";

const NAV_LINKS = [
  { label: "Find work", href: "/marketplace/jobs" },
  { label: "My contracts", href: "/marketplace/contracts" },
  { label: "Hire talent", href: "/marketplace/talent" },
];

function Logo() {
  return (
    <Link href="/marketplace" className="flex items-center gap-2" aria-label="GigsNano Market">
      <BrandLogo className="h-6" />
      <span className="text-sm font-semibold tracking-tight text-primary">Market</span>
    </Link>
  );
}

/**
 * Persistent marketplace chrome (freelance-marketplace top nav). Route-aware: renders a
 * slim variant (logo + theme toggle) on the onboarding flow, mirroring how
 * Signup strips the nav to keep focus.
 */
export function MarketplaceHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = useMarketplaceProfileStore((s) => s.display_name);
  const [scope, setScope] = useState<"jobs" | "talent">("jobs");
  const [query, setQuery] = useState("");
  const mounted = useIsClient();

  const slim = pathname.startsWith("/marketplace/onboarding");

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    router.push(`/marketplace/${scope}${q ? `?q=${encodeURIComponent(q)}` : ""}`);
  };

  const initials = displayName
    ? displayName.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase()
    : null;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-6 px-6 max-md:gap-1.5 max-md:pl-1.5 max-md:pr-4">
        {!slim && (
          <MobileNavSheet title="Market">
            <form onSubmit={onSearch} className="mb-2 flex h-11 items-center gap-2 rounded-lg border bg-background px-3">
              <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
              <input
                type="search"
                enterKeyHint="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={scope === "jobs" ? "Search jobs" : "Search talent"}
                aria-label="Search the marketplace"
                className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
            </form>
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
              {(["jobs", "talent"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={scope === s}
                  onClick={() => setScope(s)}
                  className={cn(
                    "h-9 rounded-md text-sm font-medium capitalize transition-colors duration-150",
                    scope === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                  )}
                >
                  <span className="sr-only">Search </span>
                  {s}
                </button>
              ))}
            </div>
            <div className="flex flex-col gap-0.5">
              {NAV_LINKS.map((link) => (
                <MobileNavLink key={link.href} href={link.href} active={pathname.startsWith(link.href)}>
                  {link.label}
                </MobileNavLink>
              ))}
            </div>
          </MobileNavSheet>
        )}
        <Logo />

        {!slim && (
          <>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_LINKS.map((link) => {
                const active = pathname.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                      active
                        ? "text-foreground after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-primary"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>

            <form
              onSubmit={onSearch}
              className="ml-auto hidden h-9 min-w-0 flex-1 max-w-sm items-center rounded-full border bg-input/30 pl-3 transition-colors focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30 sm:flex"
            >
              <HugeiconsIcon icon={Search01Icon} className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                aria-label="Search the marketplace"
                className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground"
              />
              <div className="h-5 w-px bg-border" aria-hidden />
              <select
                value={scope}
                onChange={(e) => setScope(e.target.value as "jobs" | "talent")}
                aria-label="Search scope"
                className="h-full cursor-pointer rounded-r-full bg-transparent pl-2 pr-3 text-sm text-muted-foreground outline-none transition-colors hover:text-foreground"
              >
                <option value="jobs">Jobs</option>
                <option value="talent">Talent</option>
              </select>
            </form>
          </>
        )}

        <div className={cn("flex items-center gap-2", slim && "ml-auto")}>
          <ThemeToggle />
          {!slim && (
            <Link
              href="/marketplace/profile"
              aria-label="My profile"
              title={mounted && displayName ? displayName : "My profile"}
              className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary transition-transform duration-150 ease-out hover:scale-105 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {mounted && initials ? initials : "•"}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
