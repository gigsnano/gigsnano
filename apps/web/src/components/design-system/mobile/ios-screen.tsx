"use client";

import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState, type ReactNode } from "react";

import { ios, text } from "./ios-css";
import { TabBar, type TTab } from "./tab-bar";

interface IIosScreenProps {
  title: string;
  /** Large-title colour; project screens wear their tint, like Reminders lists. */
  titleColor?: string;
  /** Right of the large title (e.g. open count). */
  titleTrailing?: ReactNode;
  back?: string;
  navTrailing?: ReactNode;
  /** Bottom toolbar (e.g. "New item"), sits above the tab bar. */
  toolbar?: ReactNode;
  tab?: TTab;
  children: ReactNode;
}

const COLLAPSE_AT = 36;

/**
 * Navigation-stack screen: large title that collapses into the inline bar on
 * scroll; the bar's material + hairline appear only once content runs under it.
 */
export function IosScreen({ title, titleColor, titleTrailing, back, navTrailing, toolbar, tab, children }: IIosScreenProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <header
        className="absolute inset-x-0 top-0 z-20 flex h-[94px] items-end px-2 pb-1.5"
        style={{
          background: collapsed ? ios("bar") : "transparent",
          backdropFilter: collapsed ? "blur(20px) saturate(180%)" : undefined,
          boxShadow: collapsed ? "0 0.5px 0 var(--ios-separator)" : undefined,
          transition: "background-color 180ms ease-out, box-shadow 180ms ease-out",
        }}
      >
        <div className="flex h-11 w-full items-center">
          <div className="flex min-w-[88px] items-center">
            {back ? (
              <span className="flex items-center" style={{ ...text("body"), color: ios("tint") }}>
                <HugeiconsIcon icon={ArrowLeft01Icon} size={26} color="currentColor" strokeWidth={2.2} />
                {back}
              </span>
            ) : null}
          </div>
          <span
            className="flex-1 truncate text-center"
            style={{
              ...text("headline"),
              color: ios("label"),
              opacity: collapsed ? 1 : 0,
              transition: "opacity 150ms ease-out",
            }}
          >
            {title}
          </span>
          <div className="flex min-w-[88px] items-center justify-end gap-4 pr-2" style={{ color: ios("tint") }}>
            {navTrailing}
          </div>
        </div>
      </header>

      <div
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-width:none]"
        onScroll={(e) => setCollapsed(e.currentTarget.scrollTop > COLLAPSE_AT)}
      >
        <div className="flex flex-col gap-6 px-4 pt-[94px] pb-28">
          <div className="-mb-2 flex items-baseline justify-between px-1">
            <h2 style={{ ...text("largeTitle"), color: titleColor ?? ios("label") }}>{title}</h2>
            {titleTrailing}
          </div>
          {children}
        </div>
      </div>

      {toolbar || tab ? (
        <footer
          className="absolute inset-x-0 bottom-0 z-20"
          style={{
            background: ios("bar"),
            backdropFilter: "blur(20px) saturate(180%)",
            boxShadow: "0 -0.5px 0 var(--ios-separator)",
          }}
        >
          {toolbar ? <div className="flex h-11 items-center justify-between px-4">{toolbar}</div> : null}
          {tab ? <TabBar active={tab} /> : <div className="h-[34px]" />}
        </footer>
      ) : null}
    </div>
  );
}
