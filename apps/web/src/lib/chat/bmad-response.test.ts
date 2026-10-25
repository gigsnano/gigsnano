import { describe, expect, it } from "vitest";
import { parseBmadResponse } from "./bmad-response";

describe("parseBmadResponse", () => {
  it("detects a 1-9 elicitation menu with a Select cue", () => {
    const text =
      "Here are your options:\n\n" +
      "1. Expand for audience\n" +
      "2. Critique and refine\n" +
      "3. Proceed\n\n" +
      "Select 1-3 or type your feedback:";
    const { body, widget } = parseBmadResponse(text);
    expect(widget).toEqual({
      kind: "choice",
      options: [
        { n: "1", label: "Expand for audience" },
        { n: "2", label: "Critique and refine" },
        { n: "3", label: "Proceed" },
      ],
    });
    // The numbered list is removed from the body; prose is kept.
    expect(body).toContain("Here are your options:");
    expect(body).not.toContain("1. Expand for audience");
  });

  it("detects paren-delimited options with a 'Choose' cue", () => {
    const text = "Choose one:\n1) Alpha\n2) Beta";
    const { widget } = parseBmadResponse(text);
    expect(widget).toEqual({
      kind: "choice",
      options: [
        { n: "1", label: "Alpha" },
        { n: "2", label: "Beta" },
      ],
    });
  });

  it("treats a numbered list WITHOUT a cue as plain content (no widget)", () => {
    const text = "Top goals:\n1. Faster onboarding\n2. Fewer drop-offs";
    const { widget } = parseBmadResponse(text);
    expect(widget).toBeNull();
  });

  it("ignores numbered lines inside a fenced code block", () => {
    const text = "Select an option:\n```\n1. not-an-option\n2. also-not\n```";
    const { widget } = parseBmadResponse(text);
    expect(widget).toBeNull();
  });

  it("detects an open question when the message ends with '?'", () => {
    const text = "Great. What is the primary goal of this product?";
    const { widget, body } = parseBmadResponse(text);
    expect(widget).toEqual({
      kind: "open",
      question: "What is the primary goal of this product?",
    });
    expect(body).toBe(text);
  });

  it("returns null widget for plain prose", () => {
    const text = "# Summary\n\nThis document describes the architecture.";
    const { widget, body } = parseBmadResponse(text);
    expect(widget).toBeNull();
    expect(body).toBe(text);
  });

  it("prefers choice over open when a cued menu also ends with a question", () => {
    const text = "Which path?\n1. Greenfield\n2. Brownfield";
    const { widget } = parseBmadResponse(text);
    expect(widget?.kind).toBe("choice");
  });

  it("does NOT trigger choice when the only cue word is far from the list", () => {
    const text =
      "Users can select a subscription plan during signup.\n\n" +
      "## Requirements\n\n" +
      "1. Fast onboarding\n" +
      "2. Bilingual UI\n" +
      "3. Offline-first sync";
    const { widget, body } = parseBmadResponse(text);
    expect(widget).toBeNull();
    // The numbered list must remain in the rendered body, not be stripped.
    expect(body).toContain("1. Fast onboarding");
  });
});
