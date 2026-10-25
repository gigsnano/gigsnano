"use client";

import { useState, type ReactNode } from "react";

import {
  railBSwapDirection,
  type RailBContext,
  type RailBSwapDirection,
} from "@/lib/nav/rail-b-context";

/**
 * Keys Rail B's body by context so a workspace ⇄ project swap remounts and
 * plays the directional enter (`.t-railb-ctx`). Direction is derived with the
 * adjust-state-during-render pattern — no effect, no animation on first paint,
 * and none on project → project switches (the context does not change).
 */
export function RailBContextSwitch({
  context,
  children,
}: {
  context: RailBContext;
  children: ReactNode;
}) {
  const [prev, setPrev] = useState(context);
  const [dir, setDir] = useState<RailBSwapDirection | null>(null);
  if (prev !== context) {
    setPrev(context);
    setDir(railBSwapDirection(prev, context));
  }

  return (
    <div key={context} data-dir={dir ?? undefined} className="t-railb-ctx flex flex-1 flex-col">
      {children}
    </div>
  );
}
