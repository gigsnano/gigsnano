import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { Editor } from "@tiptap/core";

import { AttachmentChip } from "./attachment-chip";
import { EAttachmentAttribute, EAttachmentHtmlAttribute } from "./types";

/**
 * Live render-time data on `editor.storage.attachment`, fed from an effect by the
 * host (never read during render) so the once-built node resolves the latest
 * download URL without the caller plumbing a ref through its render body.
 */
export interface IAttachmentStore {
  resolveUrl?: (fileId: string) => string | undefined;
}

function storeOf(editor: Editor): IAttachmentStore | undefined {
  return (editor.storage as unknown as { attachment?: IAttachmentStore }).attachment;
}

/** Point the attachment node's chips at the host's `fileId` → download-URL resolver. */
export function setAttachmentResolver(
  editor: Editor,
  resolveUrl: (fileId: string) => string | undefined,
) {
  const s = storeOf(editor);
  if (s) s.resolveUrl = resolveUrl;
}

/** Block-level `attachment` node — inserted by the comment toolbar's attach button
 *  (GIN-372). Emits the `<attachment-ref>` element the backend renders and parses
 *  (content/html.py, content/html_import.py). */
export const AttachmentExtension = Node.create({
  name: "attachment",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addStorage(): IAttachmentStore {
    return { resolveUrl: undefined };
  },

  addAttributes() {
    return {
      [EAttachmentAttribute.FileId]: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute(EAttachmentHtmlAttribute.FileId),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EAttachmentAttribute.FileId]
            ? { [EAttachmentHtmlAttribute.FileId]: attrs[EAttachmentAttribute.FileId] }
            : {},
      },
      // Rendered as element text (matches the backend), so it is not an attribute;
      // recovered from that text on parse.
      [EAttachmentAttribute.FileName]: {
        default: "",
        parseHTML: (el: HTMLElement) => el.textContent ?? "",
        renderHTML: () => ({}),
      },
      [EAttachmentAttribute.MimeType]: {
        default: null,
        parseHTML: (el: HTMLElement) => el.getAttribute(EAttachmentHtmlAttribute.MimeType),
        renderHTML: (attrs: Record<string, unknown>) =>
          attrs[EAttachmentAttribute.MimeType]
            ? { [EAttachmentHtmlAttribute.MimeType]: attrs[EAttachmentAttribute.MimeType] }
            : {},
      },
      // Non-identity display fallback; not carried in HTML (matches the backend).
      [EAttachmentAttribute.Size]: {
        default: null,
        parseHTML: () => null,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "attachment-ref" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const fileName = (node.attrs[EAttachmentAttribute.FileName] as string) || "";
    return ["attachment-ref", mergeAttributes(HTMLAttributes), fileName];
  },

  renderText({ node }) {
    return (node.attrs[EAttachmentAttribute.FileName] as string) || "attachment";
  },

  addNodeView() {
    return ReactNodeViewRenderer(AttachmentChip);
  },
});
