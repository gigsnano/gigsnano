import Image from "@tiptap/extension-image";
import { Plugin } from "@tiptap/pm/state";
import type { Editor } from "@tiptap/core";

// Paste/drop handling for image files. When an uploader is supplied the image
// is sent to the backend and the returned URL is inserted (persistent, small
// HTML); otherwise it falls back to an inline base64 data URI. Upload failures
// also fall back to base64, so a pasted image is never silently lost.

export type ImageUploader = (file: File) => Promise<string>;

export function imageFilesFrom(data: DataTransfer | null): File[] {
  if (!data) return [];
  return Array.from(data.files).filter((f) => f.type.startsWith("image/"));
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function resolveSrc(file: File, uploader?: ImageUploader): Promise<string> {
  if (!uploader) return readFileAsDataURL(file);
  return uploader(file).catch(() => readFileAsDataURL(file));
}

function insertImages(editor: Editor, files: File[], uploader?: ImageUploader, at?: number) {
  files.forEach((file, i) => {
    resolveSrc(file, uploader)
      .then((src) => {
        // First image goes to the drop position; the rest append after it.
        if (at != null && i === 0) {
          editor.chain().focus().insertContentAt(at, { type: "image", attrs: { src } }).run();
        } else {
          editor.chain().focus().setImage({ src }).run();
        }
      })
      .catch(() => {});
  });
}

/**
 * Image node + paste/drop handling. `getUploader` is read at event time (via a
 * ref in the host), so the editor's memoized extension list never needs to
 * change when the uploader identity does.
 */
export function createImagePaste(getUploader: () => ImageUploader | undefined) {
  return Image.extend({
    addProseMirrorPlugins() {
      const editor = this.editor;
      return [
        new Plugin({
          props: {
            handlePaste(_view, event) {
              const files = imageFilesFrom(event.clipboardData);
              if (files.length === 0) return false;
              event.preventDefault();
              insertImages(editor, files, getUploader());
              return true;
            },
            handleDrop(view, event) {
              const files = imageFilesFrom(event.dataTransfer);
              if (files.length === 0) return false;
              event.preventDefault();
              const pos = view.posAtCoords({ left: event.clientX, top: event.clientY });
              insertImages(editor, files, getUploader(), pos?.pos);
              return true;
            },
          },
        }),
      ];
    },
  });
}
