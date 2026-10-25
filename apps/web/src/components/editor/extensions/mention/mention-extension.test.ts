// @vitest-environment jsdom
/**
 * GIN-301 — the mention node speaks two vocabularies at once.
 *
 * JSON must be canonical (`entityId`/`entityType`/`label`, per ADR 0001) because
 * the backend registry drops attributes it doesn't declare — a mention emitting
 * the legacy names would silently lose its id the moment the editor started
 * saving JSON.
 *
 * HTML must stay exactly what shipped before (`entity_identifier`/`entity_name`),
 * because every legacy column holds it and `lib/mentions.py` parses it to raise
 * notifications.
 *
 * These assert both halves, and that a round trip through HTML preserves the id.
 */

import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";

import { UserMentionExtension } from "./mention-extension";

// A real headless editor rather than @tiptap/html's helpers: it exercises the
// same parse/serialize path the app uses, and needs no extra dependency —
// StarterKit is a direct dependency, the individual node packages are not.
const extensions = [StarterKit, UserMentionExtension];

const editorWith = (content: unknown) =>
  new Editor({ extensions, content: content as string, element: document.createElement("div") });

const docWithMention = (attrs: Record<string, unknown>) => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "mention", attrs }] }],
});

function generateHTML(doc: unknown, _ext: unknown = null) {
  const editor = editorWith(doc);
  const html = editor.getHTML();
  editor.destroy();
  return html;
}

function mentionAttrsFromHTML(html: string) {
  const editor = editorWith(html);
  const json = editor.getJSON() as {
    content?: { content?: { type: string; attrs: Record<string, unknown> }[] }[];
  };
  editor.destroy();
  return json.content?.[0]?.content?.find((n) => n.type === "mention")?.attrs;
}

describe("mention JSON is canonical", () => {
  it("emits only the canonical attribute names", () => {
    const attrs = mentionAttrsFromHTML(
      '<p><mention-component entity_identifier="u1" entity_name="user_mention" data-label="Jessy"></mention-component></p>',
    );
    expect(Object.keys(attrs ?? {}).sort()).toEqual(["entityId", "entityType", "label"]);
  });

  it("does not leak the base Mention node's own id/label attrs", () => {
    // Spreading `this.parent?.()` in addAttributes would put `id` back, and the
    // backend would drop it — leaving a mention that resolves to nobody.
    const attrs = mentionAttrsFromHTML(
      '<p><mention-component entity_identifier="u1"></mention-component></p>',
    );
    expect(attrs).not.toHaveProperty("id");
    expect(attrs?.entityId).toBe("u1");
  });

  it("reads the entity type off the legacy entity_name suffix", () => {
    expect(
      mentionAttrsFromHTML(
        '<p><mention-component entity_identifier="t1" entity_name="team_mention"></mention-component></p>',
      )?.entityType,
    ).toBe("team");
  });

  it("falls back to the id attribute when entity_identifier is absent", () => {
    expect(
      mentionAttrsFromHTML('<p><mention-component id="u9"></mention-component></p>')?.entityId,
    ).toBe("u9");
  });

  it("recovers the label from element text in legacy markup", () => {
    // Rows written before data-label existed carry the name as text content.
    expect(
      mentionAttrsFromHTML(
        '<p><mention-component entity_identifier="u1">@Jessy</mention-component></p>',
      )?.label,
    ).toBe("Jessy");
  });
});

describe("mention HTML stays backwards compatible", () => {
  it("renders the attribute names lib/mentions.py parses", () => {
    const html = generateHTML(
      docWithMention({ entityId: "u1", entityType: "user", label: "Jessy" }),
      extensions,
    );
    expect(html).toContain('entity_identifier="u1"');
    expect(html).toContain('entity_name="user_mention"');
    expect(html).toContain('id="u1"');
  });

  it("round-trips an id through HTML without losing it", () => {
    const original = docWithMention({ entityId: "u1", entityType: "user", label: "Jessy" });
    const html = generateHTML(original, extensions);
    expect(mentionAttrsFromHTML(html)).toMatchObject({
      entityId: "u1",
      entityType: "user",
      label: "Jessy",
    });
  });

  it("round-trips a team mention", () => {
    const html = generateHTML(
      docWithMention({ entityId: "t1", entityType: "team", label: "Platform" }),
      extensions,
    );
    expect(mentionAttrsFromHTML(html)?.entityType).toBe("team");
  });

  it("keeps the id when the label is missing", () => {
    // A deleted target has no name to show, but the reference must survive —
    // the chip renders it as unresolved rather than dropping the node.
    const html = generateHTML(docWithMention({ entityId: "gone", entityType: "user" }), extensions);
    expect(mentionAttrsFromHTML(html)?.entityId).toBe("gone");
  });
});
