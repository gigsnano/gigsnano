import Image from "next/image";

import { cn } from "@/lib/utils";

const FULL_SIZE = { width: 1251, height: 244 } as const;
const ICON_SIZE = { width: 309, height: 309 } as const;

type BrandLogoProps = {
  /** `full` = icon + wordmark (theme-aware). `icon` = mark only. */
  variant?: "full" | "icon";
  /** Height utility (e.g. `h-6`); width scales with the asset. */
  className?: string;
  priority?: boolean;
};

/**
 * GigsNano brand mark. Full wordmark swaps light/dark PNGs via CSS so it
 * works with `next-themes` without a client hydration flash.
 */
export function BrandLogo({
  variant = "full",
  className,
  priority = false,
}: BrandLogoProps) {
  if (variant === "icon") {
    return (
      <Image
        src="/logo-icon.png"
        alt="GigsNano"
        width={ICON_SIZE.width}
        height={ICON_SIZE.height}
        priority={priority}
        className={cn("size-8 object-contain", className)}
      />
    );
  }

  return (
    <span className={cn("inline-flex h-6 items-center", className)}>
      <Image
        src="/logo-light.png"
        alt="GigsNano"
        width={FULL_SIZE.width}
        height={FULL_SIZE.height}
        priority={priority}
        className="h-full w-auto dark:hidden"
      />
      <Image
        src="/logo-dark.png"
        alt=""
        aria-hidden
        width={FULL_SIZE.width}
        height={FULL_SIZE.height}
        priority={priority}
        className="hidden h-full w-auto dark:block"
      />
    </span>
  );
}
