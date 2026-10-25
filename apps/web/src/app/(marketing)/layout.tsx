import type { ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { spaceGrotesk } from "@/lib/fonts";
import { BrandLogo } from "@/components/brand";
import { MarketingNav } from "@/components/marketing/marketing-nav";
import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { MarketingBackdrop } from "@/components/marketing/marketing-backdrop";

import "@/components/marketing/landing/landing.css";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className={cn(
        spaceGrotesk.variable,
        "lp-surface relative flex min-h-svh flex-col overflow-x-clip [--font-heading:var(--font-display)]",
      )}
    >
      <MarketingBackdrop />

      <header className="sticky top-4 z-40 px-4">
        <div className="lp-nav mx-auto flex h-13 max-w-[74rem] backdrop-blur-2xl items-center justify-between pl-5 pr-2">
          <Link
            href="/"
            aria-label="GigsNano home"
            className="flex items-center"
          >
            <BrandLogo priority className="h-6" />
          </Link>
          <MarketingNav />
        </div>
      </header>

      <main className="flex flex-1 flex-col">{children}</main>
      <MarketingFooter />
    </div>
  );
}
