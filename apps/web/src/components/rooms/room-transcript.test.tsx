import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { RoomTranscript } from "./room-transcript";

/**
 * The room transcript is a bubble list: agent messages are left bubbles carrying
 * a small colored name label (the expert's avatar_color); the human's turns are
 * right bubbles. Unknown speakers fall back to the raw id. Rendered to static
 * markup (repo convention — no RTL/jsdom; vitest env is "node").
 */
describe("RoomTranscript", () => {
  it("labels agent bubbles by expert name and renders the human on the right", () => {
    const html = renderToStaticMarkup(
      <RoomTranscript
        messages={[
          { id: "1", role: "user", speaker: null, content: "kick off" },
          { id: "2", role: "assistant", speaker: "a", content: "analyst take" },
        ]}
        expertsById={{ a: { name: "Analyst · Mary", avatar_color: "#3b6ea5" } }}
      />,
    );
    expect(html).toContain("Analyst · Mary");
    expect(html).toContain("analyst take");
    expect(html).toContain("kick off");
    // the agent name label carries the expert color as an inline style
    expect(html).toContain("color:#3b6ea5");
  });

  it("falls back to the raw speaker id when the expert is unknown", () => {
    const html = renderToStaticMarkup(
      <RoomTranscript
        messages={[{ id: "1", role: "assistant", speaker: "ghost", content: "hi" }]}
        expertsById={{}}
      />,
    );
    expect(html).toContain("ghost");
  });
});
