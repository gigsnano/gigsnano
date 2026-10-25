import { create } from "zustand";

interface GigsAiComposerState {
  selectedAgentId: string | null;
  setSelectedAgentId: (id: string | null) => void;
  reset: () => void;
}

export const useGigsAiComposerStore = create<GigsAiComposerState>((set) => ({
  selectedAgentId: null,
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  reset: () => set({ selectedAgentId: null }),
}));
