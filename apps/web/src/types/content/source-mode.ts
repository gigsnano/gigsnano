export interface IToMarkdownResult {
  markdown: string;
  lossy: string[];
}

export interface IContentError {
  message: string;
  line?: number | null;
  col?: number | null;
}

export interface IFromMarkdownResult {
  json: Record<string, unknown> | null;
  errors: IContentError[];
}
