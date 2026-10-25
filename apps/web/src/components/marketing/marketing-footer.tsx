import Link from "next/link";

import { MARKETING_FOOTER } from "@/constants/marketing";
import { BrandLogo } from "@/components/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function MarketingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t bg-muted/20">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.6fr_repeat(4,1fr)]">
          <div>
            <BrandLogo className="h-6" />
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              AI-native project management. Plan, build, and ship with BMAD agents on every card.
            </p>
          </div>
          {MARKETING_FOOTER.map((column) => (
            <div key={column.heading}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {column.heading}
              </h3>
              <ul className="mt-3 space-y-2">
                {column.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-col items-center justify-between gap-4 border-t pt-6 sm:flex-row">
          <p className="text-xs text-muted-foreground">© {year} GigsNano. All rights reserved.</p>
          <ThemeToggle />
        </div>
      </div>
    </footer>
  );
}
