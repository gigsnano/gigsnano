import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { illustrationRegistry, type EmptyStateKey } from "./asset-registry";

export type EmptyStateAction = {
  label: string;
  /** Client handler. Omit when `href` is set for pure navigation. */
  onClick?: () => void;
  /** When set, the action renders as a link (Next.js `<Link>`). */
  href?: string;
  /** Defaults to `default` for the first action and `outline` for the rest. */
  variant?: "default" | "secondary" | "outline" | "ghost";
  disabled?: boolean;
  icon?: ReactNode;
};

export type EmptyStateProps = {
  /** Illustration key from the shared registry. Defaults to `generic`. */
  assetKey?: EmptyStateKey;
  /** Escape hatch: render a custom illustration node instead of `assetKey`. */
  asset?: ReactNode;
  title: string;
  description?: string;
  /**
   * Next actions offered to the user. Every empty route SHOULD provide at least
   * one — the EmptyState's job is to tell the user what to do next.
   */
  actions?: EmptyStateAction[];
  align?: "center" | "start";
  className?: string;
};

// Short, ease-out entrance staggered per emil-design-eng: gentle (never from
// scale(0)), sub-500ms, and gated behind `motion-safe` so reduced-motion users
// get the final state instantly. `fill-mode-both` holds the hidden state during
// each item's delay so the stagger doesn't flash.
const ENTER =
  "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-1 motion-safe:fill-mode-both motion-safe:duration-500 motion-safe:ease-out";

const delay = (ms: number): CSSProperties => ({ animationDelay: `${ms}ms` });

export function EmptyState({
  assetKey = "generic",
  asset,
  title,
  description,
  actions,
  align = "center",
  className,
}: EmptyStateProps) {
  const Illustration = illustrationRegistry[assetKey];
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-4 px-6 py-12",
        centered ? "items-center text-center" : "items-start text-left",
        className,
      )}
    >
      <div className={cn("text-muted-foreground", ENTER)} style={delay(0)}>
        {asset ?? <Illustration aria-hidden className="size-72" />}
      </div>

      <div className={cn("flex max-w-sm flex-col gap-1.5", centered && "items-center")}>
        <h3 className={cn("text-base font-semibold text-foreground", ENTER)} style={delay(60)}>
          {title}
        </h3>
        {description ? (
          <p className={cn("text-sm text-muted-foreground", ENTER)} style={delay(120)}>
            {description}
          </p>
        ) : null}
      </div>

      {actions?.length ? (
        <div
          className={cn("mt-1 flex flex-wrap gap-2", centered ? "justify-center" : "justify-start", ENTER)}
          style={delay(180)}
        >
          {actions.map((action, index) => {
            const variant = action.variant ?? (index === 0 ? "default" : "outline");
            const content = (
              <>
                {action.icon}
                {action.label}
              </>
            );

            if (action.href) {
              return (
                <Button key={action.label} asChild variant={variant} disabled={action.disabled}>
                  <Link href={action.href} onClick={action.onClick}>
                    {content}
                  </Link>
                </Button>
              );
            }

            return (
              <Button
                key={action.label}
                variant={variant}
                disabled={action.disabled}
                onClick={action.onClick}
              >
                {content}
              </Button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
