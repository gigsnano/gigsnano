import { estimateContentBytes } from "@/lib/format/file-size";
import { EDocumentSource, type IDocument } from "@/types";

export type TAttachmentPreviewKind = "image" | "markdown" | "text" | "pdf" | "unsupported";

const PLACEHOLDER_SUFFIX = "\n\nUploaded reference file.";

/** Display filename for rows and downloads. */
export function attachmentDisplayName(doc: IDocument): string {
  return doc.file_name ?? `${doc.title}.md`;
}

/** Best-effort preview mode from mime type + filename. */
export function attachmentPreviewKind(doc: IDocument): TAttachmentPreviewKind {
  const mime = (doc.mime_type ?? "").toLowerCase();
  const name = attachmentDisplayName(doc).toLowerCase();

  if (mime.startsWith("image/")) return "image";
  if (mime === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (mime.includes("markdown") || name.endsWith(".md")) return "markdown";
  if (mime.startsWith("text/")) return "text";
  if (doc.source === EDocumentSource.Agent) return "markdown";
  if (doc.content?.trim()) return "markdown";
  return "unsupported";
}

/** True when upload stored placeholder markdown instead of file bytes. */
export function isPlaceholderUploadContent(doc: IDocument): boolean {
  const content = doc.content?.trim() ?? "";
  if (!content.startsWith("#")) return false;
  return content.endsWith(PLACEHOLDER_SUFFIX.trim()) || content.includes(PLACEHOLDER_SUFFIX);
}

/** Data URL for inline image preview, when content carries image bytes. */
export function imagePreviewSrc(doc: IDocument): string | null {
  const content = doc.content?.trim() ?? "";
  if (!content) return null;
  if (content.startsWith("data:image/")) return content;
  const mime = doc.mime_type ?? "";
  if (mime.startsWith("image/") && /^[A-Za-z0-9+/=\s]+$/.test(content.slice(0, 200))) {
    const b64 = content.replace(/\s/g, "");
    return `data:${mime};base64,${b64}`;
  }
  return null;
}

/** Blob URL for PDF iframe preview (caller must revoke). */
export function pdfPreviewBlobUrl(doc: IDocument): string | null {
  if (isPlaceholderUploadContent(doc)) return null;
  const content = doc.content?.trim() ?? "";
  if (!content) return null;
  try {
    const blob = attachmentContentToBlob(doc);
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

/** Build a downloadable Blob from stored attachment content. */
export function attachmentContentToBlob(doc: IDocument): Blob {
  const content = doc.content ?? "";
  const mime = doc.mime_type ?? "application/octet-stream";

  if (content.startsWith("data:")) {
    const comma = content.indexOf(",");
    if (comma === -1) return new Blob([content], { type: mime });
    const header = content.slice(0, comma);
    const payload = content.slice(comma + 1);
    const typeMatch = /^data:([^;,]+)/i.exec(header);
    const type = typeMatch?.[1] ?? mime;
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type });
  }

  if (
    !content.startsWith("#") &&
    mime.startsWith("image/") &&
    /^[A-Za-z0-9+/=\s]+$/.test(content.trim().slice(0, 200))
  ) {
    const binary = atob(content.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  const textMime = mime.startsWith("text/") ? `${mime};charset=utf-8` : mime;
  return new Blob([content], { type: textMime });
}

/** Trigger a browser download of the attachment payload. */
export function downloadAttachment(doc: IDocument): void {
  const filename = attachmentDisplayName(doc);
  const blob = attachmentContentToBlob(doc);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
