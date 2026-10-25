import { create } from "zustand";
import { persist } from "zustand/middleware";

import { EPersonaRole } from "@/lib/persona/persona-config";

interface IPersonaRoleState {
  /** Last-selected persona, restored on return + used as the /persona default. */
  role: EPersonaRole;
  setRole: (role: EPersonaRole) => void;
}

export const usePersonaRoleStore = create<IPersonaRoleState>()(
  persist(
    (set) => ({
      role: EPersonaRole.Manager,
      setRole: (role) => set({ role }),
    }),
    { name: "gn.persona-role" },
  ),
);
