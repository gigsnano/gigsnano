"use client";

import { Moon02Icon, Sun03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { TColorScheme } from "@gigsnano/core";
import { useState } from "react";

import { AnatomySection } from "./sections/anatomy-section";
import { ColorSection } from "./sections/color-section";
import { ComponentsSection } from "./sections/components-section";
import { LayoutSection } from "./sections/layout-section";
import { ScreensSection } from "./sections/screens-section";
import { TypeSection } from "./sections/type-section";

const NAV = [
  { id: "screens", label: "Screens" },
  { id: "anatomy", label: "Why Reminders" },
  { id: "color", label: "Color" },
  { id: "type", label: "Type" },
  { id: "layout", label: "Layout & motion" },
  { id: "components", label: "Components" },
];

/** /design/mobile — review surface for the iOS design system before it lands in packages/mobile. */
export function MobileDesignSystem() {
  const [scheme, setScheme] = useState<TColorScheme>("light");

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4">
          <span className="text-sm font-semibold whitespace-nowrap">GigsNano Mobile · Design System</span>
          <nav aria-label="Sections" className="hidden flex-1 gap-4 overflow-x-auto md:flex">
            {NAV.map((n) => (
              <a key={n.id} href={`#${n.id}`} className="text-sm whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground">
                {n.label}
              </a>
            ))}
          </nav>
          <div role="radiogroup" aria-label="Phone appearance" className="ml-auto flex rounded-full bg-muted p-0.5">
            {(["light", "dark"] as const).map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={scheme === s}
                aria-label={`${s} appearance`}
                onClick={() => setScheme(s)}
                className={`grid size-8 place-items-center rounded-full transition-colors ${scheme === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
              >
                <HugeiconsIcon icon={s === "light" ? Sun03Icon : Moon02Icon} size={16} />
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4">
        <div className="pt-14 pb-4">
          <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">iOS · v1 proposal</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight text-balance">A Reminders-grade mobile app</h1>
          <p className="mt-3 max-w-2xl leading-relaxed text-pretty text-muted-foreground">
            Grouped surfaces, project tints, system type and spring motion — modelled on Apple Reminders. Tokens live in{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-xs">@gigsnano/core</code> (<code className="rounded bg-muted px-1 py-0.5 text-xs">theme/ios.ts</code>), so this page and the Expo app read the same values.
          </p>
        </div>
        <ScreensSection scheme={scheme} />
        <AnatomySection />
        <ColorSection />
        <TypeSection scheme={scheme} />
        <LayoutSection />
        <ComponentsSection scheme={scheme} />
      </main>
    </div>
  );
}
