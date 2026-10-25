import type { ISticky } from "@/types";

const TS = "2026-06-20T10:00:00Z";

export const stickies: ISticky[] = [
  {
    id: "stk_1",
    workspace_slug: "acme",
    body: "Ship Sprint-0 review by Friday",
    color: "#fbbf24",
    created_at: TS,
    updated_at: TS,
  },
  {
    id: "stk_2",
    workspace_slug: "acme",
    body: "Connect GitHub before doc sync demo",
    color: "#60a5fa",
    created_at: TS,
    updated_at: TS,
  },
];
