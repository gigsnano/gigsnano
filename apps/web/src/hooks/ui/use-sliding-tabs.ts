"use client";

import { useEffect, useRef } from "react";

/** Positions a sliding pill under the active tab (transitions.dev #16). */
export function useSlidingTabs(activeIndex: number) {
  const barRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const pill = pillRef.current;
    if (!bar || !pill) return;

    const tabs = [...bar.querySelectorAll<HTMLElement>("[data-tab-index]")];
    const tab = tabs[activeIndex];
    if (!tab) return;

    const move = (animate: boolean) => {
      if (!animate) {
        pill.style.transition = "none";
      }
      pill.style.transform = `translateX(${tab.offsetLeft}px)`;
      pill.style.width = `${tab.offsetWidth}px`;
      if (!animate) {
        void pill.offsetWidth;
        pill.style.transition = "";
      }
    };

    move(false);

    const onResize = () => move(false);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex]);

  return { barRef, pillRef };
}
