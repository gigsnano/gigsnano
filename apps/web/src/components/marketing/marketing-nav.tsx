"use client";

import Link from "next/link";

import { MARKETING_NAV_LINKS } from "@/constants/marketing";
import { useAuthUser } from "@/hooks/auth/use-auth";
import { UserMenu } from "@/components/layout/user-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { MobileNavLink, MobileNavSheet } from "@/components/layout/mobile-nav-sheet";

/**
 * Auth-aware landing nav inside the floating glass bar. Section anchors
 * (desktop), theme toggle, and pill CTAs: signed-out visitors get Sign in / Get
 * started; signed-in visitors get a workspace shortcut + the account menu.
 */
export function MarketingNav() {
  const { data: user, isPending } = useAuthUser();

  return (
    <nav className="flex items-center gap-1 ">
      <div className="mr-1 hidden items-center md:flex">
        {MARKETING_NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground"
          >
            {link.label}
          </Link>
        ))}
      </div>

      <ThemeToggle className="rounded-[10px]" />

      {/* Reserve the auth slot while /auth/me resolves — avoids a flash + shift. */}
      {isPending ? (
        <div
          className="ml-1 h-9 w-32 animate-pulse rounded-[10px] bg-muted"
          aria-hidden
        />
      ) : user ? (
        <>
          <Link
            href={
              user.last_workspace_slug
                ? `/${user.last_workspace_slug}`
                : "/onboarding"
            }
            className="ml-1 whitespace-nowrap rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-md hover:shadow-primary/35 active:scale-[0.98]"
          >
            Go to workspace
          </Link>
          <UserMenu />
        </>
      ) : (
        <>
          <Link
            href="/sign-in"
            className="hidden rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors duration-300 hover:text-foreground sm:block"
          >
            Sign in
          </Link>
          <Link
            href="/sign-up"
            className="ml-1 whitespace-nowrap rounded-[10px] bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm shadow-primary/25 transition-[box-shadow,transform] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:shadow-md hover:shadow-primary/35 active:scale-[0.98]"
          >
            Get started
          </Link>
        </>
      )}

      <MobileNavSheet title="Menu" className="ml-0.5 rounded-[10px]">
        <div className="flex flex-col gap-0.5">
          {MARKETING_NAV_LINKS.map((link) => (
            <MobileNavLink key={link.href} href={link.href}>
              {link.label}
            </MobileNavLink>
          ))}
          {!isPending && !user ? <MobileNavLink href="/sign-in">Sign in</MobileNavLink> : null}
        </div>
      </MobileNavSheet>
    </nav>
  );
}
