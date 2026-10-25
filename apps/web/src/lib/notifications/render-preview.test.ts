import { describe, expect, it } from "vitest";

import { renderPreview } from "./render-preview";

describe("renderPreview", () => {
  it("substitutes known keys", () => {
    const out = renderPreview(
      "{story}",
      "{actor} assigned you in {project}",
      { actor: "Grace", project: "App", story: "Fix bug" },
    );
    expect(out.title).toBe("Fix bug");
    expect(out.body).toBe("Grace assigned you in App");
  });

  it("leaves missing keys empty", () => {
    const out = renderPreview("{story}", "{actor} in {project}", { story: "Only title" });
    expect(out.body).toBe(" in ");
  });
});
