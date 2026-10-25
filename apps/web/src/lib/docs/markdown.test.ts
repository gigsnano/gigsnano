import { describe, expect, it } from "vitest";

import { renderSimpleMarkdown, splitDocBlocks } from "./markdown";

describe("renderSimpleMarkdown", () => {
  it("renders headers at three levels", () => {
    expect(renderSimpleMarkdown("# Title")).toContain("<h1");
    expect(renderSimpleMarkdown("## Section")).toContain("<h2");
    expect(renderSimpleMarkdown("### Sub")).toContain("<h3");
  });

  it("renders bold and inline code", () => {
    expect(renderSimpleMarkdown("a **b** c")).toContain("<strong>b</strong>");
    const code = renderSimpleMarkdown("press `Cmd+A` now");
    expect(code).toContain("<code");
    expect(code).toContain("Cmd+A");
  });

  it("does not turn ** inside a code span into bold", () => {
    const html = renderSimpleMarkdown("`a**b`");
    expect(html).not.toContain("<strong>");
  });

  it("renders a horizontal rule for --- and not as a list item", () => {
    const html = renderSimpleMarkdown("---");
    expect(html).toContain("<hr");
    expect(html).not.toContain("<li>");
    expect(html).not.toContain("---");
  });

  it("renders a bulleted list", () => {
    const html = renderSimpleMarkdown("- one\n- two");
    expect(html).toContain("<ul");
    expect(html).toContain("<li>one</li>");
    expect(html).toContain("<li>two</li>");
  });

  it("renders a pipe table into a real table", () => {
    const md = "| A | B |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |";
    const html = renderSimpleMarkdown(md);
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain(">A<");
    expect(html).toContain(">4<");
    // The raw pipe separator row must not leak through as text.
    expect(html).not.toContain("---");
  });

  it("escapes HTML in content", () => {
    const html = renderSimpleMarkdown("a <script> tag");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});

describe("splitDocBlocks", () => {
  it("splits prose on blank lines like the old block splitter", () => {
    const blocks = splitDocBlocks("First para\n\nSecond para");
    expect(blocks).toEqual([
      { kind: "markdown", text: "First para" },
      { kind: "markdown", text: "Second para" },
    ]);
  });

  it("keeps a fenced code block as one block, even with blank lines inside", () => {
    const md = "```mermaid\ngraph TD\n\nA --> B\n```";
    const blocks = splitDocBlocks(md);
    expect(blocks).toEqual([
      { kind: "code", lang: "mermaid", code: "graph TD\n\nA --> B" },
    ]);
  });

  it("classifies a mermaid fence distinctly from a plain code fence", () => {
    const blocks = splitDocBlocks("```ts\nconst a = 1;\n```");
    expect(blocks).toEqual([{ kind: "code", lang: "ts", code: "const a = 1;" }]);
  });

  it("treats a bare fence (no language) as a code block", () => {
    const blocks = splitDocBlocks("```\nplain\n```");
    expect(blocks).toEqual([{ kind: "code", lang: "", code: "plain" }]);
  });

  it("isolates a fence that sits directly against surrounding prose", () => {
    const md = "Intro line\n```mermaid\ngraph TD\nA --> B\n```\nOutro line";
    const blocks = splitDocBlocks(md);
    expect(blocks).toEqual([
      { kind: "markdown", text: "Intro line" },
      { kind: "code", lang: "mermaid", code: "graph TD\nA --> B" },
      { kind: "markdown", text: "Outro line" },
    ]);
  });

  it("interleaves prose and multiple fences in order", () => {
    const md = "# Title\n\n```mermaid\ngraph TD\nA-->B\n```\n\nMiddle\n\n```js\nx()\n```";
    const kinds = splitDocBlocks(md).map((b) => b.kind);
    expect(kinds).toEqual(["markdown", "code", "markdown", "code"]);
  });

  it("handles an unterminated fence by consuming to end of content", () => {
    const blocks = splitDocBlocks("```mermaid\ngraph TD\nA --> B");
    expect(blocks).toEqual([
      { kind: "code", lang: "mermaid", code: "graph TD\nA --> B" },
    ]);
  });

  it("produces no empty markdown blocks from trailing whitespace", () => {
    const blocks = splitDocBlocks("Only para\n\n\n");
    expect(blocks).toEqual([{ kind: "markdown", text: "Only para" }]);
  });
});
