import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DocBlockView } from "./document-blocks";

describe("DocBlockView", () => {
  it("renders a markdown block as formatted HTML", () => {
    const html = renderToStaticMarkup(
      <DocBlockView block={{ kind: "markdown", text: "a **bold** word" }} />,
    );
    expect(html).toContain("<strong>bold</strong>");
  });

  it("renders a plain code fence as a code block with its language label", () => {
    const html = renderToStaticMarkup(
      <DocBlockView block={{ kind: "code", lang: "ts", code: "const a = 1;" }} />,
    );
    expect(html).toContain("<pre");
    expect(html).toContain("const a = 1;");
    expect(html).toContain("ts");
  });

  it("routes a mermaid fence to the diagram renderer, not raw text", () => {
    const html = renderToStaticMarkup(
      <DocBlockView
        block={{ kind: "code", lang: "mermaid", code: "graph TD\nA --> B" }}
      />,
    );
    // The diagram component mounts (async SVG render happens client-side, so the
    // placeholder shows on the server); the point is the raw mermaid source is
    // NOT dumped as a <pre> code block.
    expect(html).toContain("Rendering diagram");
    expect(html).not.toContain("<pre");
    expect(html).not.toContain("A --&gt; B");
  });
});
