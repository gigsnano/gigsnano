"use client";

import { useEffect, useState } from "react";

const BOTTOM_THRESHOLD_PX = 48;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function scrollToEnd(el: HTMLElement) {
  el.scrollTo({ top: el.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
}

/**
 * Sticks a scroll region to its bottom edge as content streams in (a live
 * transcript, a chat thread), but only while the user hasn't scrolled up to
 * read something earlier — once they have, new arrivals stop yanking them
 * back down until they explicitly ask to jump back (`scrollToBottom`).
 */
export function useStickToBottom<T extends HTMLElement>(dep: unknown) {
  // A callback ref, not useRef: the scroll region often isn't mounted on the
  // first render (a loading skeleton or empty state stands in for it), and a
  // plain ref's useEffect(..., []) only runs once — before the real element
  // exists — so the listener never attached once the element finally showed
  // up. Storing the node in state re-runs the attach effect whenever the
  // element mounts or changes.
  const [el, setEl] = useState<T | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  const ref = (node: T | null) => {
    setEl(node);
  };

  useEffect(() => {
    if (!el) return undefined;

    const handleScroll = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_THRESHOLD_PX);
    };

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [el]);

  // New content arrived — only follow it down if the user was already at the
  // bottom. `atBottom` is intentionally a dependency here (not read off a
  // ref) so this never touches state outside an effect/handler.
  useEffect(() => {
    if (!atBottom || !el) return;
    scrollToEnd(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberately excludes atBottom's setter churn; re-running per dep change is the point.
  }, [dep, atBottom, el]);

  const scrollToBottom = () => {
    if (!el) return;
    setAtBottom(true);
    scrollToEnd(el);
  };

  return { ref, atBottom, scrollToBottom };
}
