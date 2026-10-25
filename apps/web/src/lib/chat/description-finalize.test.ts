import { describe, expect, it } from "vitest";
import { distillDescription, htmlHasContent } from "./description-finalize";
import type { IThreadMessage } from "@/types";

const msg = (role: "user" | "assistant", content: string): IThreadMessage =>
  ({ id: `${role}-${content.slice(0, 4)}`, role, content }) as IThreadMessage;

describe("distillDescription", () => {
  it("returns markdown + html and is not a raw transcript concatenation", () => {
    const messages = [
      msg("assistant", "Hi! I'm your Analyst."),
      msg("user", "We need a login screen with email + Google sign-in."),
      msg("assistant", "Got it. Users authenticate via email or Google; sessions are cookie-based."),
    ];
    const out = distillDescription(messages, "Analyst");
    // Not a transcript: the greeting must not appear verbatim in the output.
    expect(out.markdown).not.toContain("Hi! I'm your Analyst.");
    expect(out.markdown.length).toBeGreaterThan(0);
    expect(out.html).toContain("<"); // rendered as HTML
    expect(htmlHasContent(out.html)).toBe(true);
  });

  it("always returns a non-empty markdown even with no user turns", () => {
    const out = distillDescription([], "Product Manager");
    expect(out.markdown.trim().length).toBeGreaterThan(0);
  });

  it("proves distillation by dropping early assistant turns", () => {
    const messages = [
      msg("assistant", "ZEBRA_MARKER early architectural aside that should be dropped. Consider microservices vs monolith."),
      msg("user", "Build a login flow."),
      msg("assistant", "Implement OAuth2 with JWT tokens for sessions."),
    ];
    const out = distillDescription(messages, "Architect");
    // Critical assertion: early marker is NOT present, proving early assistant turn was dropped.
    expect(out.markdown).not.toContain("ZEBRA_MARKER");
    // Proof the distillation used the latest assistant turn:
    expect(out.markdown.toLowerCase()).toContain("oauth");
  });
});

describe("htmlHasContent", () => {
  it("is false for empty/whitespace/empty-tag html", () => {
    expect(htmlHasContent("")).toBe(false);
    expect(htmlHasContent("   ")).toBe(false);
    expect(htmlHasContent("<p></p>")).toBe(false);
    expect(htmlHasContent("<p><br></p>")).toBe(false);
  });
  it("is true when there is real text", () => {
    expect(htmlHasContent("<p>Real content</p>")).toBe(true);
  });
});
