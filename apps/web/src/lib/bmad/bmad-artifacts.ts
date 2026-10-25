import type { IDocument } from "@/types";
import { EDocumentKind, EDocumentSource } from "@/types";

const WORKFLOW_KIND: Record<string, EDocumentKind> = {
  "bmad-product-brief": EDocumentKind.Brief,
  "bmad-prd": EDocumentKind.Prd,
  "bmad-create-architecture": EDocumentKind.Architecture,
  "bmad-ux": EDocumentKind.Ux,
  "bmad-create-epics-and-stories": EDocumentKind.Epics,
  "bmad-research": EDocumentKind.Research,
  "bmad-brainstorming": EDocumentKind.Other,
  "bmad-generate-project-context": EDocumentKind.Other,
  "bmad-document-project": EDocumentKind.Other,
};

export function artifactDocumentFromStory(
  workspaceSlug: string,
  projectId: string,
  projectName: string,
  workflow: string,
  title: string,
  artifact: string,
): Omit<IDocument, "id" | "created_at" | "updated_at"> | null {
  const kind = WORKFLOW_KIND[workflow];
  if (!kind) return null;

  const now = new Date().toISOString();
  const slug = workflow.replace(/^bmad-/, "");
  return {
    workspace_slug: workspaceSlug,
    project_id: projectId,
    project_name: projectName,
    title,
    kind,
    workflow,
    content: `# ${title}\n\n_Artifact: ${artifact}_\n\nGenerated during Sprint-0 on ${now.slice(0, 10)}.\n\n<!-- Select a paragraph to add a review comment in Docs. -->`,
    comments: [],
    is_draft: false,
    source: EDocumentSource.Agent,
    story_id: null,
    workspace_path: `docs/${slug}.md`,
    file_name: `${slug}.md`,
    mime_type: "text/markdown",
  };
}
