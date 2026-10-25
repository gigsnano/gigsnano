import type { IPage } from "@/types";

const TS = "2026-06-01T10:00:00Z";

export const pages: IPage[] = [
  {
    id: "pg_mba_1",
    workspace_slug: "acme",
    project_id: "prj_mba",
    title: "Engineering onboarding",
    content:
      "## Welcome\n\nClone the repo and run `pnpm dev`.\n\n## Sprint rituals\n\nDaily standup at 10am. Retro every other Friday.",
    created_at: TS,
    updated_at: TS,
  },
  {
    id: "pg_mba_2",
    workspace_slug: "acme",
    project_id: "prj_mba",
    title: "API conventions",
    content:
      "## REST\n\nAll endpoints use snake_case JSON.\n\n## Auth\n\nBearer token from `/auth/sign-in/`.",
    created_at: TS,
    updated_at: "2026-06-15T14:00:00Z",
  },
];
