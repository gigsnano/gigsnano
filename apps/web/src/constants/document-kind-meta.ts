import { EDocumentKind } from "@/types";

export const DOCUMENT_KIND_LABEL: Record<EDocumentKind, string> = {
  [EDocumentKind.Brief]: "Brief",
  [EDocumentKind.Prd]: "PRD",
  [EDocumentKind.Architecture]: "Architecture",
  [EDocumentKind.Ux]: "UX",
  [EDocumentKind.Epics]: "Epics",
  [EDocumentKind.Research]: "Research",
  [EDocumentKind.Other]: "Document",
};
