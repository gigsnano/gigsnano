// @vitest-environment jsdom
/**
 * GIN-301 — the editor may only emit nodes and marks the canonical schema knows.
 *
 * The backend validates incoming JSON against the registry in
 * `docs/adr/structured-content-schema.json` and coerces anything undeclared into
 * `unknownBlock`/`unknownMark`. That is the right behaviour for content written
 * by a *newer* client, but for our own editor it means an extension added here
 * without a matching registry entry silently degrades every document it touches.
 *
 * Nothing else catches that: the editor renders it, the HTML column looks fine,
 * and only a Markdown export or a later reload shows the loss. So this asserts
 * the two vocabularies still line up.
 */

import { Editor } from "@tiptap/core";
import Image from "@tiptap/extension-image";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { UserMentionExtension } from "./extensions/mention/mention-extension";
import { WorkItemRefExtension } from "./extensions/work-item-ref/work-item-ref-extension";
import { AttachmentExtension } from "./extensions/attachment/attachment-extension";

/** Mirrors the `nodes` keys of docs/adr/structured-content-schema.json. */
const REGISTRY_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "hardBreak",
  "codeBlock",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "taskList",
  "taskItem",
  "horizontalRule",
  "image",
  "mention",
  "workItemRef",
  "attachment",
  "table",
  "tableRow",
  "tableCell",
  "tableHeader",
  "unknownBlock",
]);

/** Mirrors the `marks` keys of the same registry. */
const REGISTRY_MARKS = new Set([
  "bold",
  "italic",
  "strike",
  "underline",
  "code",
  "link",
  "unknownMark",
]);

const extensions = [
  StarterKit.configure({ codeBlock: false }),
  TaskList,
  TaskItem.configure({ nested: true }),
  Image,
  UserMentionExtension,
  WorkItemRefExtension,
  AttachmentExtension,
];

function jsonFor(html: string) {
  const editor = new Editor({ extensions, content: html, element: document.createElement("div") });
  const json = editor.getJSON();
  editor.destroy();
  return json;
}

type Node = { type?: string; marks?: { type?: string }[]; content?: Node[] };

function collect(node: Node, nodes: Set<string>, marks: Set<string>) {
  if (node.type) nodes.add(node.type);
  for (const mark of node.marks ?? []) if (mark.type) marks.add(mark.type);
  for (const child of node.content ?? []) collect(child, nodes, marks);
}

const SAMPLE = [
  "<h2>Heading</h2>",
  "<p>plain <strong>bold</strong> <em>italic</em> <s>struck</s> <u>under</u> <code>code</code></p>",
  '<p><a href="https://example.com">link</a></p>',
  "<ul><li><p>bullet</p></li></ul>",
  "<ol><li><p>ordered</p></li></ol>",
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>task</p></li></ul>',
  "<blockquote><p>quote</p></blockquote>",
  "<hr>",
  "<p>line<br>break</p>",
  '<p><img src="https://img.test/x.png" alt="x"></p>',
  '<p><mention-component entity_identifier="u1" data-label="J"></mention-component></p>',
  '<p><work-item-ref data-work-item-id="w1" data-code="GIN-7">GIN-7</work-item-ref></p>',
  '<attachment-ref data-file-id="f1" data-mime-type="application/pdf">spec.pdf</attachment-ref>',
].join("");

describe("editor output stays inside the canonical schema", () => {
  it("emits no node type the backend registry would discard", () => {
    const nodes = new Set<string>();
    collect(jsonFor(SAMPLE) as Node, nodes, new Set());
    expect([...nodes].filter((n) => !REGISTRY_NODES.has(n))).toEqual([]);
  });

  it("emits no mark the backend registry would discard", () => {
    const marks = new Set<string>();
    collect(jsonFor(SAMPLE) as Node, new Set(), marks);
    expect([...marks].filter((m) => !REGISTRY_MARKS.has(m))).toEqual([]);
  });

  it("keeps the mention's identity in the emitted JSON", () => {
    // The one attribute whose loss would be invisible in the UI but would break
    // notifications and every future reference lookup.
    expect(JSON.stringify(jsonFor(SAMPLE))).toContain('"entityId":"u1"');
  });

  it("preserves task checked state, which GIN-78 was filed about", () => {
    expect(JSON.stringify(jsonFor(SAMPLE))).toContain('"checked":true');
  });

  it("keeps the workItemRef's identity in the emitted JSON (GIN-362)", () => {
    expect(JSON.stringify(jsonFor(SAMPLE))).toContain('"workItemId":"w1"');
  });

  it("keeps the attachment's identity in the emitted JSON (GIN-372)", () => {
    expect(JSON.stringify(jsonFor(SAMPLE))).toContain('"fileId":"f1"');
  });
});
