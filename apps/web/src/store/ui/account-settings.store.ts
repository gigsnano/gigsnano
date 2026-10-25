import { create } from "zustand";

import type { EAccountSettingsTab } from "@/constants/account-settings-tabs";

interface IAccountSettingsStore {
  open: boolean;
  tab: EAccountSettingsTab;
  openModal: (tab?: EAccountSettingsTab) => void;
  closeModal: () => void;
  setTab: (tab: EAccountSettingsTab) => void;
}

export const useAccountSettingsStore = create<IAccountSettingsStore>((set) => ({
  open: false,
  tab: "profile",
  openModal: (tab = "profile") => set({ open: true, tab }),
  closeModal: () => set({ open: false }),
  setTab: (tab) => set({ tab }),
}));
