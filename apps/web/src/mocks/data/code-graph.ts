import type { ICodeGraph } from "@/types";

/**
 * Canned codebase graph for the mock-first `/code/graph/` endpoint — a small
 * but multi-community graph (3 directories) so the Sigma view, community
 * coloring, and click-to-select are all exercisable with no backend.
 */
export const mockCodeGraph: ICodeGraph = {
  nodes: [
    { id: "src/components/board.tsx", label: "board.tsx", kind: "file", community: "components", source_file: "src/components/board.tsx" },
    { id: "src/components/sprint-board.tsx", label: "sprint-board.tsx", kind: "file", community: "components", source_file: "src/components/sprint-board.tsx" },
    { id: "src/components/story-chat.tsx", label: "story-chat.tsx", kind: "file", community: "components", source_file: "src/components/story-chat.tsx" },
    { id: "src/hooks/use-stories.ts", label: "use-stories.ts", kind: "file", community: "hooks", source_file: "src/hooks/use-stories.ts" },
    { id: "src/hooks/use-projects.ts", label: "use-projects.ts", kind: "file", community: "hooks", source_file: "src/hooks/use-projects.ts" },
    { id: "src/services/story.service.ts", label: "story.service.ts", kind: "file", community: "services", source_file: "src/services/story.service.ts" },
    { id: "src/services/project.service.ts", label: "project.service.ts", kind: "file", community: "services", source_file: "src/services/project.service.ts" },
    { id: "src/services/api.service.ts", label: "api.service.ts", kind: "file", community: "services", source_file: "src/services/api.service.ts" },
    { id: "src/lib/bmad-unlock.ts", label: "bmad-unlock.ts", kind: "file", community: "lib", source_file: "src/lib/bmad-unlock.ts" },
    { id: "src/types/story.ts", label: "story.ts", kind: "file", community: "types", source_file: "src/types/story.ts" },
  ],
  edges: [
    { source: "src/components/board.tsx", target: "src/components/sprint-board.tsx", weight: 3 },
    { source: "src/components/sprint-board.tsx", target: "src/components/story-chat.tsx", weight: 2 },
    { source: "src/components/sprint-board.tsx", target: "src/hooks/use-stories.ts", weight: 4 },
    { source: "src/components/board.tsx", target: "src/hooks/use-projects.ts", weight: 1 },
    { source: "src/hooks/use-stories.ts", target: "src/services/story.service.ts", weight: 5 },
    { source: "src/hooks/use-projects.ts", target: "src/services/project.service.ts", weight: 2 },
    { source: "src/services/story.service.ts", target: "src/services/api.service.ts", weight: 3 },
    { source: "src/services/project.service.ts", target: "src/services/api.service.ts", weight: 3 },
    { source: "src/hooks/use-stories.ts", target: "src/lib/bmad-unlock.ts", weight: 2 },
    { source: "src/services/story.service.ts", target: "src/types/story.ts", weight: 1 },
    { source: "src/lib/bmad-unlock.ts", target: "src/types/story.ts", weight: 1 },
  ],
};
