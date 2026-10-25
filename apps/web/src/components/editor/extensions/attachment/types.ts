/**
 * attachment node attributes (GIN-372).
 *
 * Same JSON/HTML split as the mention and workItemRef nodes:
 *
 * - **JSON** (`fileId` / `fileName` / `mimeType` / `size`) is the canonical shape
 *   the backend registry validates (`content/schema.py`).
 * - **HTML** (`data-file-id` / `data-mime-type`, with `fileName` as element text)
 *   is what the backend renders and parses (`content/html.py`,
 *   `content/html_import.py`). `size` has no HTML form; it round-trips only
 *   through JSON. The download URL is derived from `fileId` at render, never
 *   stored — so a moved/expired capability URL never goes stale in the document.
 */

/** Canonical JSON attribute names (ADR 0001 node registry). */
export enum EAttachmentAttribute {
  FileId = "fileId",
  FileName = "fileName",
  MimeType = "mimeType",
  Size = "size",
}

/** Derived HTML attribute names on the `attachment-ref` element. */
export enum EAttachmentHtmlAttribute {
  FileId = "data-file-id",
  MimeType = "data-mime-type",
}

export interface IAttachmentAttrs {
  fileId: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
}
