import { APIService } from "./api.service";
import type { IFromMarkdownResult, IToMarkdownResult } from "@/types/content/source-mode";

/** Canonical Markdown <-> JSON conversion for the editor's source mode (GIN-307).
 *  Thin wrapper over the backend's stateless /content endpoints. */
class ContentService extends APIService {
  toMarkdown(json: Record<string, unknown>): Promise<IToMarkdownResult> {
    return this.post<IToMarkdownResult>("/content/to-markdown", { json });
  }

  fromMarkdown(markdown: string): Promise<IFromMarkdownResult> {
    return this.post<IFromMarkdownResult>("/content/from-markdown", { markdown });
  }
}

export const contentService = new ContentService();
