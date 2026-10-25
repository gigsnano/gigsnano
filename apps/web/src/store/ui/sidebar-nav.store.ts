import { create } from "zustand";
import { persist } from "zustand/middleware";

import {
  PERSONAL_ITEMS,
  WORKSPACE_ITEMS,
  ESSENTIAL_WORKSPACE_IDS,
  reconcilePrefs,
  clampProjectLimit,
  type ISidebarPref,
} from "@/lib/nav/sidebar-nav-items";

type NavGroup = "personal" | "workspace";

interface ISidebarNavState {
  personal: ISidebarPref[];
  workspace: ISidebarPref[];
  limitProjects: boolean;
  projectLimit: number;
  favorites: string[];

  setGroup: (group: NavGroup, order: ISidebarPref[]) => void;
  togglePinned: (group: NavGroup, id: string) => void;
  setLimitProjects: (on: boolean) => void;
  setProjectLimit: (n: number) => void;
  toggleFavorite: (projectId: string) => void;
}

const toggleId = (list: string[], id: string) =>
  list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

/** Per-user sidebar navigation preferences (persisted to localStorage). */
export const useSidebarNav = create<ISidebarNavState>()(
  persist(
    (set) => ({
      personal: reconcilePrefs(undefined, PERSONAL_ITEMS),
      workspace: reconcilePrefs(undefined, WORKSPACE_ITEMS, ESSENTIAL_WORKSPACE_IDS),
      limitProjects: false,
      projectLimit: 10,
      favorites: [],

      setGroup: (group, order) =>
        set(group === "personal" ? { personal: order } : { workspace: order }),

      togglePinned: (group, id) =>
        set((s) => {
          const flip = (list: ISidebarPref[]) =>
            list.map((p) => (p.id === id ? { ...p, pinned: !p.pinned } : p));
          return group === "personal"
            ? { personal: flip(s.personal) }
            : { workspace: flip(s.workspace) };
        }),

      setLimitProjects: (on) => set({ limitProjects: on }),
      setProjectLimit: (n) => set({ projectLimit: clampProjectLimit(n) }),
      toggleFavorite: (projectId) =>
        set((s) => ({ favorites: toggleId(s.favorites, projectId) })),
    }),
    {
      name: "gn.sidebar-nav",
      // Reconcile persisted prefs against the current catalog on rehydrate so
      // added/removed nav items never leave the store stale or broken.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<ISidebarNavState>;
        return {
          ...current,
          ...p,
          personal: reconcilePrefs(p.personal, PERSONAL_ITEMS),
          workspace: reconcilePrefs(p.workspace, WORKSPACE_ITEMS, ESSENTIAL_WORKSPACE_IDS),
        };
      },
    },
  ),
);
