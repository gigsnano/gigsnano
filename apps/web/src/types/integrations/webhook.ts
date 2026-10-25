import type { ID, ISODateString } from "@/types/common";

export interface IWebhookDelivery {
  id: ID;
  status: "success" | "failed";
  response_code: number;
  created_at: ISODateString;
}

export interface IWebhook {
  id: ID;
  workspace_slug: string;
  url: string;
  events: string[];
  secret_preview: string;
  enabled: boolean;
  last_delivery: IWebhookDelivery | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateWebhookPayload {
  url: string;
  events: string[];
}

export interface IUpdateWebhookPayload {
  url?: string;
  events?: string[];
  enabled?: boolean;
}
