"use client";

import { Fragment } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { cn } from "@/lib/utils";
import { useBreadcrumbs } from "@/hooks/ui/use-breadcrumbs";

/** Global, route-driven breadcrumb rendered on the left of every secondary header. */
export function Breadcrumbs() {
  const items = useBreadcrumbs();

  if (items.length === 0) return null;

  return (
    <Breadcrumb className="min-w-0">
      {/* nowrap + min-w-0 so it shrinks (and clips) instead of pushing the
          page actions off-screen when the content area is narrow. */}
      <BreadcrumbList className="flex-nowrap">
        {items.map((item, i) => {
          const isLast = i === items.length - 1;
          // Collapse the middle crumbs when the header container gets tight
          // (e.g. the GigsAI pane is open) — keep the first + last, Plane-style.
          // At phone width keep only the last (the current page).
          const collapsible = !isLast && i > 0;
          const phoneHidden = !isLast && i === 0;
          return (
            <Fragment key={`${item.label}-${i}`}>
              {i > 0 ? (
                <BreadcrumbSeparator
                  className={
                    collapsible ? "hidden @min-[34rem]/hdr:flex" : "hidden @min-[24rem]/hdr:flex"
                  }
                />
              ) : null}
              <BreadcrumbItem
                className={cn(
                  "min-w-0 max-w-[16rem]",
                  isLast ? "shrink-0 @max-[24rem]/hdr:shrink" : "truncate",
                  collapsible && "hidden @min-[34rem]/hdr:flex",
                  phoneHidden && "hidden @min-[24rem]/hdr:flex",
                )}
              >
                {item.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={item.href} className="truncate">
                      {item.label}
                    </Link>
                  </BreadcrumbLink>
                ) : (
                  <BreadcrumbPage className="truncate">{item.label}</BreadcrumbPage>
                )}
              </BreadcrumbItem>
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
