"use client";

import { useTheme } from "next-themes";
import { HugeiconsIcon } from "@hugeicons/react";
import { Sun03Icon, Moon02Icon } from "@hugeicons/core-free-icons";

import { Button } from "@/components/ui/button";

/**
 * Light/dark toggle. The icon shown is driven purely by the `.dark` class (CSS),
 * so there's no server/client mismatch — only the click handler touches
 * next-themes. Sun rotates/scales out as Moon rotates/scales in.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      className={className}
      aria-label="Toggle theme"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <span className="relative size-4">
        <HugeiconsIcon
          icon={Sun03Icon}
          className="absolute inset-0 size-4 rotate-0 scale-100 transition-transform duration-300 ease-out dark:-rotate-90 dark:scale-0"
        />
        <HugeiconsIcon
          icon={Moon02Icon}
          className="absolute inset-0 size-4 rotate-90 scale-0 transition-transform duration-300 ease-out dark:rotate-0 dark:scale-100"
        />
      </span>
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
