// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Citation } from "./citation";
import { CitationProvider } from "./citation-context";

// Mock the data hooks so the test is hermetic.
vi.mock("@/hooks/project/use-projects", () => ({
  useWorkspaceFile: () => ({ data: { content: "a\nb\nc\nd\ne" }, isLoading: false, isError: false }),
}));

vi.mock("@/hooks/docs/use-documents", () => ({
  useDocuments: () => ({
    data: [{ id: "d1", title: "PRD", project_id: "p1" }],
  }),
}));

const codeHref = `#gigs-cite:code:${encodeURIComponent("a/b.py:2-4")}`;
const docHref = `#gigs-cite:doc:${encodeURIComponent("PRD")}`;

// vitest.config.ts doesn't set `test.globals`, so RTL's auto-detected
// `afterEach` cleanup never registers; without this, DOM from one test
// leaks into the next `render()` call in the same file.
afterEach(cleanup);

describe("Citation", () => {
  it("renders a clickable pill and toggles the snippet when a project is in context", async () => {
    render(
      <CitationProvider workspaceSlug="acme" projectId="p1">
        <Citation href={codeHref}>a/b.py:2-4</Citation>
      </CitationProvider>,
    );
    const btn = screen.getByRole("button", { name: /a\/b\.py:2-4/ });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    // The snippet's line-range header ("2-4", a standalone span distinct
    // from the button's combined "a/b.py:2-4" label) doesn't exist yet --
    // RepoCodeSnippet lazy-mounts on first open.
    expect(screen.queryByText("2-4")).toBeNull();

    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "true");
    expect(await screen.findByText("2-4")).toBeInTheDocument(); // snippet header line range
    expect(screen.getByText("a/b.py")).toBeInTheDocument(); // snippet header path

    fireEvent.click(btn);
    expect(btn).toHaveAttribute("aria-expanded", "false");
  });

  it("renders a non-interactive chip when projectId is null", () => {
    render(
      <CitationProvider workspaceSlug="acme" projectId={null}>
        <Citation href={codeHref}>a/b.py:2-4</Citation>
      </CitationProvider>,
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("a/b.py:2-4")).toBeInTheDocument();
  });

  it("renders a doc citation as a link to the matching document", () => {
    render(
      <CitationProvider workspaceSlug="acme" projectId="p1">
        <Citation href={docHref}>PRD</Citation>
      </CitationProvider>,
    );
    const link = screen.getByRole("link", { name: "PRD" });
    expect(link).toHaveAttribute("href", "/acme/docs/d1");
  });

  it("renders a non-interactive chip when the doc title doesn't resolve", () => {
    render(
      <CitationProvider workspaceSlug="acme" projectId="p1">
        <Citation href={`#gigs-cite:doc:${encodeURIComponent("Nonexistent")}`}>Nonexistent</Citation>
      </CitationProvider>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText("Nonexistent")).toBeInTheDocument();
  });

  it("renders a plain chip when href is missing or unparseable", () => {
    render(<Citation>raw text</Citation>);
    expect(screen.getByText("raw text")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });
});
