import { create } from "zustand";
import { persist } from "zustand/middleware";

/** GigsAI model options. GigsAI never runs on Opus — don't add it back. */
export const GIGS_AI_MODELS = [
  { id: "sonnet-5", label: "GigsAI · Sonnet 5" },
  { id: "haiku-4-5", label: "GigsAI · Haiku 4.5" },
] as const;

export type GigsAiModelId = (typeof GIGS_AI_MODELS)[number]["id"];

const DEFAULT_GIGS_AI_MODEL: GigsAiModelId = "sonnet-5";

/** Coerce legacy/persisted ids (e.g. the retired `opus-4-8`) to the current API contract. */
export function resolveGigsAiModelId(model: string | undefined): GigsAiModelId {
  const normalized = model?.replaceAll(".", "-");
  return GIGS_AI_MODELS.find((m) => m.id === normalized || m.id === model)?.id ?? DEFAULT_GIGS_AI_MODEL;
}

type AiPaneOpenListener = () => void;
const aiPaneOpenListeners = new Set<AiPaneOpenListener>();

function notifyAiPaneOpenListeners() {
  for (const listener of aiPaneOpenListeners) {
    listener();
  }
}

/** Subscribe to pane-open transitions (toggle/setOpen(true)). */
export function registerAiPaneOpenListener(listener: AiPaneOpenListener) {
  aiPaneOpenListeners.add(listener);
  return () => {
    aiPaneOpenListeners.delete(listener);
  };
}

interface IAiPaneStore {
  /** Right-side GigsAI pane visibility. */
  open: boolean;
  /** Wide mode — the pane grows and flushes the content column narrower. */
  expanded: boolean;
  model: GigsAiModelId;
  toggle: () => void;
  setOpen: (open: boolean) => void;
  toggleExpanded: () => void;
  setModel: (model: GigsAiModelId) => void;
}

/** UI state for the GigsAI assistant pane (open + selected model). */
export const useAiPaneStore = create<IAiPaneStore>()(
  persist(
    (set) => ({
      open: false,
      expanded: false,
      model: DEFAULT_GIGS_AI_MODEL,
      toggle: () =>
        set((s) => {
          const next = !s.open;
          if (next) notifyAiPaneOpenListeners();
          // Collapse back to normal width whenever the pane closes.
          return { open: next, expanded: next && s.expanded };
        }),
      setOpen: (open) => {
        set((s) => ({ open, expanded: open && s.expanded }));
        if (open) notifyAiPaneOpenListeners();
      },
      toggleExpanded: () => set((s) => ({ expanded: !s.expanded })),
      setModel: (model) => set({ model }),
    }),
    {
      name: "gn.ai-pane",
      // Don't persist `open` — the pane always starts closed on load.
      partialize: (s) => ({ model: s.model }),
      merge: (persisted, current) => {
        const state = persisted as Partial<IAiPaneStore> | undefined;
        return {
          ...current,
          ...state,
          model: resolveGigsAiModelId(state?.model),
        };
      },
    },
  ),
);
