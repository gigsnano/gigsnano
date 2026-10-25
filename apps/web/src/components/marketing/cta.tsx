import Link from "next/link";
import { HugeiconsIcon } from "@hugeicons/react";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";

import { cn } from "@/lib/utils";

/**
 * Pill CTA with a nested "button-in-button" trailing arrow that slides on hover
 * and a spring-eased press. Two brand-token variants; works in light and dark.
 */
export function Cta({
  href,
  children,
  variant = "primary",
  className,
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group inline-flex items-center gap-3 rounded-full py-2 pl-6 pr-2 text-sm font-medium",
        "transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.98]",
        variant === "primary"
          ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/35"
          : "border bg-card/70 text-foreground backdrop-blur-sm hover:bg-accent",
        className,
      )}
    >
      <span>{children}</span>
      <span
        className={cn(
          "flex size-8 items-center justify-center rounded-full transition-transform duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] group-hover:scale-105 group-hover:translate-x-0.5 group-hover:-translate-y-px",
          variant === "primary" ? "bg-primary-foreground/15" : "bg-primary/10 text-primary",
        )}
      >
        <HugeiconsIcon icon={ArrowRight01Icon} className="size-4" aria-hidden />
      </span>
    </Link>
  );
}
