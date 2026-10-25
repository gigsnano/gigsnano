import type { ENotificationKind } from "@/types/workspace/notification";

export interface INotificationTemplate {
  trigger_key: string;
  kind: ENotificationKind;
  label: string;
  description: string;
  title_template: string;
  body_template: string;
  default_title_template: string;
  default_body_template: string;
  variables: string[];
  enabled: boolean;
  email_enabled: boolean;
  email_subject_template: string;
  email_body_html_template: string;
  updated_at: string;
}

export interface IUpdateNotificationTemplatePayload {
  title_template?: string;
  body_template?: string;
  enabled?: boolean;
  email_enabled?: boolean;
  email_subject_template?: string;
  email_body_html_template?: string;
}
