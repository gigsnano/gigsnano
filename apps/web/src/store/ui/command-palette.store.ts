import { create } from "zustand";
import type { CommandPageKey } from "@/lib/nav/command-registry";

export type CreateKind = "work-item" | "project" | "workspace" | "page" | "view" | "cycle" | "module";

interface ICommandPaletteState {
  open: boolean;
  page: CommandPageKey | null;
  createTarget: CreateKind | null;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setPage: (page: CommandPageKey | null) => void;
  openCreate: (kind: CreateKind) => void;
  clearCreate: () => void;
  reset: () => void;
}

export const useCommandPaletteStore = create<ICommandPaletteState>((set) => ({
  open: false,
  page: null,
  createTarget: null,
  setOpen: (open) => set({ open, page: null }),
  toggle: () => set((s) => ({ open: !s.open, page: null })),
  setPage: (page) => set({ page }),
  openCreate: (kind) => set({ createTarget: kind, open: false, page: null }),
  clearCreate: () => set({ createTarget: null }),
  reset: () => set({ open: false, page: null, createTarget: null }),
}));
