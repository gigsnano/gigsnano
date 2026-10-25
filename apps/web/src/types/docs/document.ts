import type { ID, ISODateString } from "@/types/common";

export enum EDocumentKind {
  Brief = "brief",
  Prd = "prd",
  Architecture = "architecture",
  Ux = "ux",
  Epics = "epics",
  Research = "research",
  Other = "other",
}

export enum EDocumentSource {
  User = "user",
  Agent = "agent",
}

export interface IDocumentComment {
  id: ID;
  document_id: ID;
  block_index: number;
  body: string;
  author_name: string;
  assignee: string | null;
  resolved: boolean;
  created_at: ISODateString;
}

export interface IDocument {
  id: ID;
  workspace_slug: string;
  project_id: ID;
  project_name: string;
  title: string;
  kind: EDocumentKind;
  workflow: string | null;
  content: string;
  comments: IDocumentComment[];
  is_draft: boolean;
  source: EDocumentSource;
  story_id: ID | null;
  workspace_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  created_at: ISODateString;
  updated_at: ISODateString;
}

export interface ICreateDocumentPayload {
  title: string;
  project_id: ID;
  kind: EDocumentKind;
  content?: string;
}

export interface IUploadStoryDocumentPayload {
  title: string;
  project_id: ID;
  story_id: ID;
  file_name: string;
  mime_type: string;
  content?: string;
}

export interface IUpdateDocumentPayload {
  title?: string;
  content?: string;
}
