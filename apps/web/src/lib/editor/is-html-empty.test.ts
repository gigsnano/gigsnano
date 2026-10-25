import { describe, expect, it } from "vitest";

import { isEditorHtmlEmpty } from "./is-html-empty";

describe("isEditorHtmlEmpty", () => {
  it("treats empty paragraph as empty", () => {
    expect(isEditorHtmlEmpty("<p></p>")).toBe(true);
  });

  it("treats mention-only as non-empty", () => {
    expect(
      isEditorHtmlEmpty(
        '<p><mention-component entity_identifier="u1" entity_name="user_mention"></mention-component></p>',
      ),
    ).toBe(false);
  });

  it("treats text as non-empty", () => {
    expect(isEditorHtmlEmpty("<p>Hello</p>")).toBe(false);
  });
});
