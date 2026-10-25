/** Human-readable file size for attachment rows. */
export function formatFileSize(bytes: number): string {
  if (bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Estimate bytes from text content when backend has no file_size. */
export function estimateContentBytes(content: string | undefined | null): number {
  if (!content) return 0;
  if (content.startsWith("data:")) {
    const comma = content.indexOf(",");
    if (comma !== -1) {
      const payload = content.slice(comma + 1).replace(/\s/g, "");
      return Math.floor((payload.length * 3) / 4);
    }
  }
  return new TextEncoder().encode(content).length;
}
