import { APIError } from "@/services/api-error";

/** Maps an import-flow error (file upload or GitHub-issues import/preview) to
 * user-facing copy, preferring the backend's `detail` string when present so
 * 404/409/422 responses show the real reason instead of a generic message. */
export function importErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    const detail = (error.data as { detail?: string } | null)?.detail;
    if (detail) return detail;
    if (error.status === 403) return "You don't have permission to import into this workspace.";
    if (error.status === 413) return "File is too large — the import cap is 10 MB.";
    if (error.status === 400) return "That file couldn't be read. Check the format and try again.";
  }
  if (error instanceof Error && error.message) return error.message;
  return "Import failed. Please try again.";
}
