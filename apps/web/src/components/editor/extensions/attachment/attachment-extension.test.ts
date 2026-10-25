// @vitest-environment jsdom
/**
 * GIN-372 — the attachment node speaks two vocabularies, like mention/workItemRef.
 *
 * JSON is canonical (`fileId`/`fileName`/`mimeType`/`size`, per ADR 0001). HTML is
 * exactly the `<attachment-ref data-file-id data-mime-type>fileName</attachment-ref>`
 * element the backend renders and parses (content/html.py, content/html_import.py).
 * `size` has no HTML form and round-trips only through JSON.
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { AttachmentExtension } from "./attachment-extension";

const extensions = [StarterKit, AttachmentExtension];

const editorWith = (content: unknown) =>
  new Editor({ extensions, content: content as string, element: document.createElement("div") });

const docWithAttachment = (attrs: Record<string, unknown>) => ({
  type: "doc",
  content: [{ type: "attachment", attrs }],
});

function generateHTML(doc: unknown) {
  const editor = editorWith(doc);
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

function attrsFromHTML(html: string) {
  const editor = editorWith(html);
  const json = editor.getJSON() as { content?: { type: string; attrs: Record<string, unknown> }[] };
  editor.destroy();
  return json.content?.find((n) => n.type === "attachment")?.attrs;
}

describe("attachment JSON is canonical", () => {
  it("emits only the canonical attribute names", () => {
    const attrs = attrsFromHTML(
      '<attachment-ref data-file-id="f1" data-mime-type="application/pdf">spec.pdf</attachment-ref>',
    );
    expect(Object.keys(attrs ?? {}).sort()).toEqual(["fileId", "fileName", "mimeType", "size"]);
  });

  it("reads fileId, mimeType and the fileName from element text", () => {
    const attrs = attrsFromHTML(
      '<attachment-ref data-file-id="f1" data-mime-type="image/png">shot.png</attachment-ref>',
    );
    expect(attrs).toMatchObject({ fileId: "f1", mimeType: "image/png", fileName: "shot.png" });
  });
});

describe("attachment HTML matches the backend element", () => {
  it("renders the id, mime-type, and fileName-as-text the backend parses", () => {
    const html = generateHTML(
      docWithAttachment({ fileId: "f1", fileName: "spec.pdf", mimeType: "application/pdf", size: 2048 }),
    );
    expect(html).toContain('data-file-id="f1"');
    expect(html).toContain('data-mime-type="application/pdf"');
    expect(html).toContain(">spec.pdf</attachment-ref>");
    // size is a non-identity fallback and is deliberately NOT in the HTML.
    expect(html).not.toContain("2048");
  });

  it("round-trips the fileId through HTML without losing it", () => {
    const html = generateHTML(
      docWithAttachment({ fileId: "f1", fileName: "spec.pdf", mimeType: null, size: null }),
    );
    expect(attrsFromHTML(html)).toMatchObject({ fileId: "f1", fileName: "spec.pdf" });
  });

  it("escapes a hostile fileId/fileName so no live element reaches the DOM (GIN-306)", () => {
    const html = generateHTML(
      docWithAttachment({
        fileId: '"><img src=x onerror=alert(1)>',
        fileName: "<b>x</b>",
        mimeType: null,
        size: null,
      }),
    );
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el.querySelector("attachment-ref")).not.toBeNull();
  });
});
