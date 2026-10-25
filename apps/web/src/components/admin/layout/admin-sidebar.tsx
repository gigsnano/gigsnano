"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { HugeiconsIcon } from "@hugeicons/react";

import { ADMIN_NAV } from "@/constants/admin-nav";
import { useStaffMe } from "@/hooks/admin/use-admin";
import { BrandLogo } from "@/components/brand";
import { MobileNavLink, MobileNavSheet } from "@/components/layout/mobile-nav-sheet";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { cn } from "@/lib/utils";

function isActive(pathname: string, href: string): boolean {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

/** Desktop (md+) admin sidebar. Phones get the same nav from `AdminMobileHeader`. */
export function AdminSidebar() {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-sidebar-border bg-sidebar max-md:hidden">
      <div className="flex h-14 items-center gap-2 px-4">
        <BrandLogo className="h-5" />
        <span className="text-xs font-medium text-muted-foreground">Admin</span>
      </div>
      <nav className="flex flex-1 flex-col gap-0.5 px-2 py-2">
        <AdminNavLinks />
      </nav>
      <div className="border-t border-sidebar-border px-3 py-2">
        <AdminStaffFooter />
      </div>
    </aside>
  );
}

/** Phone (below md) top bar: menu button opening the admin nav, plus the brand. */
export function AdminMobileHeader() {
  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-sidebar-border bg-sidebar pl-1.5 pr-3 md:hidden">
      <MobileNavSheet title="Admin" footer={<AdminStaffFooter />}>
        <div className="flex flex-col gap-0.5">
          <AdminNavLinks inSheet />
        </div>
      </MobileNavSheet>
      <BrandLogo className="h-5" />
      <span className="text-xs font-medium text-muted-foreground">Admin</span>
    </header>
  );
}

function AdminNavLinks({ inSheet = false }: { inSheet?: boolean }) {
  const pathname = usePathname();
  const { data } = useStaffMe();
  const privileges = new Set(data?.privileges ?? []);
  const items = ADMIN_NAV.filter((item) => privileges.has(item.privilege));

  return items.map((item) => {
    const active = isActive(pathname, item.href);
    const icon = (
      <HugeiconsIcon
        icon={item.icon}
        size={18}
        strokeWidth={1.8}
        className={cn("shrink-0 transition-colors duration-150", active && "text-sidebar-primary")}
      />
    );
    return inSheet ? (
      <MobileNavLink key={item.href} href={item.href} active={active}>
        {icon}
        {item.label}
      </MobileNavLink>
    ) : (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors duration-150",
          "hover:bg-sidebar-accent hover:text-sidebar-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          active && "bg-sidebar-accent font-medium text-sidebar-foreground",
        )}
      >
        {icon}
        {item.label}
      </Link>
    );
  });
}

function AdminStaffFooter() {
  const { data } = useStaffMe();
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-xs font-medium text-sidebar-foreground">{data?.display_name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{data?.role_name}</p>
      </div>
      <ThemeToggle />
    </div>
  );
}
