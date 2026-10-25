import { create } from "zustand";
import { persist } from "zustand/middleware";

import { isBelow } from "@/lib/layout/breakpoints";

export const PANEL_MIN_WIDTH = 220;
export const PANEL_MAX_WIDTH = 360;
const PANEL_DEFAULT_WIDTH = 260;
const PANEL_STORAGE_KEY = "gn.panel";

const clampWidth = (px: number) =>
  Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, Math.round(px)));

/** Below `md` the panel is an off-canvas drawer, not a grid column (globals.css). */
const isPhoneViewport = () => isBelow("md");

interface IPanelStore {
  collapsed: boolean;
  /** Phone-only drawer: the pathname it was opened on, or null. The drawer is
   *  open only while that is still the route, so any navigation closes it.
   *  Not persisted, so phones always start closed and the desktop `collapsed`
   *  preference is never touched by the drawer. */
  mobileOpenAt: string | null;
  width: number;
  toggleCollapsed: () => void;
  setCollapsed: (collapsed: boolean) => void;
  closeMobile: () => void;
  /** Show/hide the panel the way the current viewport presents it. */
  showPanel: (pathname: string) => void;
  hidePanel: () => void;
  setWidth: (px: number) => void;
}

/**
 * Pure UI state for the dual-rail extended panel. First genuine client-only
 * state in the app — CLAUDE.md reserves Zustand for exactly this. Persisted to
 * localStorage; `PANEL_INIT_SCRIPT` in the root layout reads the same key/shape
 * before first paint.
 */
export const usePanelStore = create<IPanelStore>()(
  persist(
    (set) => ({
      collapsed: false,
      mobileOpenAt: null,
      width: PANEL_DEFAULT_WIDTH,
      toggleCollapsed: () => set((s) => ({ collapsed: !s.collapsed })),
      setCollapsed: (collapsed) => set({ collapsed }),
      closeMobile: () => set({ mobileOpenAt: null }),
      showPanel: (pathname) =>
        set(isPhoneViewport() ? { mobileOpenAt: pathname } : { collapsed: false }),
      hidePanel: () => set(isPhoneViewport() ? { mobileOpenAt: null } : { collapsed: true }),
      setWidth: (px) => set({ width: clampWidth(px) }),
    }),
    {
      name: PANEL_STORAGE_KEY,
      partialize: (s) => ({ collapsed: s.collapsed, width: s.width }),
    },
  ),
);
