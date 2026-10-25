// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BmadResponseParts } from "./bmad-response";
import { CitationProvider } from "./citation-context";

// BmadResponseParts is rendered directly (outside a real assistant-ui thread),
// so the runtime hooks it calls need a minimal stand-in.
vi.mock("@assistant-ui/react", () => ({
  useThreadRuntime: () => ({ append: vi.fn() }),
  useMessage: (selector: (m: { isLast: boolean }) => unknown) => selector({ isLast: true }),
  useThread: (selector: (t: { messages: { role: string }[] }) => unknown) =>
    selector({ messages: [{ role: "user" }] }),
}));

// Citation's data hooks — hermetic per citation.test.tsx's approach. Not
// exercised here (the pill isn't clicked), but the modules are statically
// imported by the render tree.
vi.mock("@/hooks/project/use-projects", () => ({
  useWorkspaceFile: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/docs/use-documents", () => ({
  useDocuments: () => ({ data: [] }),
}));

afterEach(cleanup);

describe("BmadResponseParts citation wiring", () => {
  it("renders a citation pill for a code reference in a complete message", () => {
    const text = "See the implementation at [src/foo.ts:1-3] for details.";
    render(
      <CitationProvider workspaceSlug="acme" projectId="p1">
        <BmadResponseParts type="text" text={text} status={{ type: "complete" }} />
      </CitationProvider>,
    );
    expect(screen.getByRole("button", { name: /src\/foo\.ts:1-3/ })).toBeInTheDocument();
  });

  it("does not transform mid-stream (running) text into a citation pill", () => {
    const text = "See the implementation at [src/foo.ts:1-3] for details.";
    render(
      <CitationProvider workspaceSlug="acme" projectId="p1">
        <BmadResponseParts type="text" text={text} status={{ type: "running" }} />
      </CitationProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
  });
});
