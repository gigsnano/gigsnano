// @vitest-environment jsdom
/**
 * GIN-362 — the workItemRef node speaks two vocabularies, like the mention node.
 *
 * JSON must be canonical (`workItemId`/`code`/`title`, per ADR 0001) because the
 * backend registry drops attributes it doesn't declare. HTML must be exactly the
 * `<work-item-ref data-work-item-id data-code>code</work-item-ref>` element the
 * backend renders and parses (content/html.py, content/html_import.py).
 *
 * These assert both halves, and that a round trip through HTML keeps the id.
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { WorkItemRefExtension } from "./work-item-ref-extension";

const extensions = [StarterKit, WorkItemRefExtension];

const editorWith = (content: unknown) =>
  new Editor({ extensions, content: content as string, element: document.createElement("div") });

const docWithRef = (attrs: Record<string, unknown>) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "workItemRef", attrs }] }],
});

function generateHTML(doc: unknown) {
  const editor = editorWith(doc);
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

function refAttrsFromHTML(html: string) {
  const editor = editorWith(html);
  const json = editor.getJSON() as {
    content?: { content?: { type: string; attrs: Record<string, unknown> }[] }[];
  };
  editor.destroy();
  return json.content?.[0]?.content?.find((n) => n.type === "workItemRef")?.attrs;
}

describe("workItemRef JSON is canonical", () => {
  it("emits only the canonical attribute names", () => {
    const attrs = refAttrsFromHTML(
      '<p><work-item-ref data-work-item-id="w1" data-code="GIN-7">GIN-7</work-item-ref></p>',
    );
    expect(Object.keys(attrs ?? {}).sort()).toEqual(["code", "title", "workItemId"]);
  });

  it("does not leak the base Mention node's own id/label attrs", () => {
    const attrs = refAttrsFromHTML('<p><work-item-ref data-work-item-id="w1"></work-item-ref></p>');
    expect(attrs).not.toHaveProperty("id");
    expect(attrs).not.toHaveProperty("label");
    expect(attrs?.workItemId).toBe("w1");
  });

  it("recovers the code from element text when data-code is absent", () => {
    expect(
      refAttrsFromHTML('<p><work-item-ref data-work-item-id="w1">GIN-9</work-item-ref></p>')?.code,
    ).toBe("GIN-9");
  });
});

describe("workItemRef HTML matches the backend element", () => {
  it("renders the id, code, and code-as-text the backend parses", () => {
    const html = generateHTML(docWithRef({ workItemId: "w1", code: "GIN-7", title: "Fix it" }));
    expect(html).toContain('data-work-item-id="w1"');
    expect(html).toContain('data-code="GIN-7"');
    expect(html).toContain(">GIN-7</work-item-ref>");
    // title is a non-identity fallback and is deliberately NOT in the HTML.
    expect(html).not.toContain("Fix it");
  });

  it("round-trips an id through HTML without losing it", () => {
    const html = generateHTML(docWithRef({ workItemId: "w1", code: "GIN-7", title: "" }));
    expect(refAttrsFromHTML(html)).toMatchObject({ workItemId: "w1", code: "GIN-7" });
  });

  it("keeps the id when the code is missing (unresolved)", () => {
    const html = generateHTML(docWithRef({ workItemId: "gone", code: "", title: "" }));
    expect(refAttrsFromHTML(html)?.workItemId).toBe("gone");
  });

  it("escapes a hostile id/code so no live element reaches the DOM (GIN-306)", () => {
    const html = generateHTML(
      docWithRef({ workItemId: '"><img src=x onerror=alert(1)>', code: "<b>x</b>", title: "" }),
    );
    // The real guarantee is at the parse boundary: the attribute quote is escaped
    // (so the payload can't break out) and the code renders as text — so parsing
    // the serialized HTML yields no <img>/<b> element, only the ref node.
    const el = document.createElement("div");
    el.innerHTML = html;
    expect(el.querySelector("img")).toBeNull();
    expect(el.querySelector("b")).toBeNull();
    expect(el.querySelector("work-item-ref")).not.toBeNull();
  });
});
