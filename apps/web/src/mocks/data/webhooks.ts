import type { IWebhook } from "@/types";

const TS = "2026-05-20T10:00:00Z";

export const webhooks: IWebhook[] = [
  {
    id: "wh_acme_1",
    workspace_slug: "acme",
    url: "https://hooks.example.com/gigsnano",
    events: ["story.updated", "sprint.completed"],
    secret_preview: "whsec_••••••••4f2a",
    enabled: true,
    last_delivery: {
      id: "del_1",
      status: "success",
      response_code: 200,
      created_at: "2026-06-28T09:00:00Z",
    },
    created_at: TS,
    updated_at: TS,
  },
];
