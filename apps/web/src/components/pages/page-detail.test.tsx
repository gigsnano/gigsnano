// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { APIError } from "@/services/api-error";
import type { IPage } from "@/types";

const {
  pageState,
  mutateAsync,
  refetch,
  deleteMutate,
} = vi.hoisted(() => {
  const mutateAsync = vi.fn();
  const refetch = vi.fn();
  const deleteMutate = vi.fn();
  const pageState: {
    data: IPage | undefined;
    isPending: boolean;
    isError: boolean;
  } = {
    data: undefined,
    isPending: false,
    isError: false,
  };
  return { pageState, mutateAsync, refetch, deleteMutate };
});

vi.mock("@/hooks/docs/use-pages", () => ({
  usePage: () => ({
    data: pageState.data,
    isPending: pageState.isPending,
    isError: pageState.isError,
    refetch,
  }),
  useUpdatePage: () => ({ mutateAsync, isPending: false }),
  useDeletePage: () => ({ mutate: deleteMutate, isPending: false, isError: false }),
  usePagePresence: () => ({ data: { viewers: [] } }),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

vi.mock("@/hooks/auth/use-auth", () => ({
  useAuthUser: () => ({ data: { id: "u1", display_name: "Ada" } }),
}));

vi.mock("@/components/editor", () => ({
  RichEditor: ({
    value,
    onChange,
    editable = true,
  }: {
    value: string;
    onChange: (html: string, json: Record<string, unknown>) => void;
    editable?: boolean;
  }) => (
    <div data-testid="rich-editor" data-editable={String(editable)} data-value={value}>
      <button
        type="button"
        data-testid="rich-editor-emit"
        onClick={() =>
          onChange("<p>Edited body</p>", {
            type: "doc",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Edited body" }] }],
          })
        }
      >
        Emit change
      </button>
    </div>
  ),
}));

vi.mock("@/lib/docs/simple-markdown", () => ({
  SimpleMarkdown: ({ text }: { text: string }) => (
    <div data-testid="simple-markdown">{text}</div>
  ),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

import { PageDetail } from "./page-detail";

function makePage(overrides: Partial<IPage> = {}): IPage {
  return {
    id: "page_1",
    workspace_slug: "acme",
    project_id: "prj_1",
    title: "Runbook",
    content: "<h1>Runbook</h1><p>Deploy.</p>",
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-02T12:00:00Z",
    ...overrides,
  };
}

function renderDetail() {
  return render(
    <PageDetail workspaceSlug="acme" projectId="prj_1" pageId="page_1" />,
  );
}

beforeEach(() => {
  pageState.data = makePage();
  pageState.isPending = false;
  pageState.isError = false;
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(makePage());
  refetch.mockReset();
  deleteMutate.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("PageDetail TipTap editing", () => {
  it("HTML read mode renders RichEditor with editable=false and the page HTML", () => {
    renderDetail();

    const editor = screen.getByTestId("rich-editor");
    expect(editor).toHaveAttribute("data-editable", "false");
    expect(editor).toHaveAttribute("data-value", "<h1>Runbook</h1><p>Deploy.</p>");
    expect(screen.queryByTestId("simple-markdown")).toBeNull();
  });

  it("legacy markdown read mode renders SimpleMarkdown and not read-only RichEditor", () => {
    pageState.data = makePage({ content: "## Welcome\n\nClone the repo." });
    renderDetail();

    expect(screen.getByTestId("simple-markdown")).toHaveTextContent("## Welcome");
    expect(screen.queryByTestId("rich-editor")).toBeNull();
  });

  it("Edit renders editable RichEditor seeded with page content and keeps the title input", () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editor = screen.getByTestId("rich-editor");
    expect(editor).toHaveAttribute("data-editable", "true");
    expect(editor).toHaveAttribute("data-value", "<h1>Runbook</h1><p>Deploy.</p>");
    expect(screen.getByLabelText("Title")).toHaveValue("Runbook");
  });

  it("Save after RichEditor change sends JSON content_format and if_updated_at", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "  Ops Runbook  " } });
    fireEvent.click(screen.getByTestId("rich-editor-emit"));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      title: "Ops Runbook",
      content: JSON.stringify({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Edited body" }] }],
      }),
      content_format: "json",
      if_updated_at: "2026-07-02T12:00:00Z",
    });
  });

  it("title-only Save omits content and content_format", async () => {
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Renamed" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      title: "Renamed",
      if_updated_at: "2026-07-02T12:00:00Z",
    });
    const payload = mutateAsync.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("content");
    expect(payload).not.toHaveProperty("content_format");
  });

  it("Edit on a legacy markdown page seeds the editor with rendered HTML, not raw markdown", () => {
    pageState.data = makePage({ content: "## Welcome\n\nClone the repo." });
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const seeded = screen.getByTestId("rich-editor").getAttribute("data-value") ?? "";
    expect(seeded).toContain("<h2");
    expect(seeded).not.toContain("## Welcome");
  });

  it("deletes the page from the overflow menu after confirming", async () => {
    renderDetail();
    // Radix opens the menu on pointerdown, not click.
    const trigger = screen.getByRole("button", { name: "Options for Runbook" });
    fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
    fireEvent.pointerUp(trigger, { button: 0, pointerType: "mouse" });
    fireEvent.click(trigger);

    fireEvent.click(await screen.findByRole("menuitem", { name: /delete page/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete page" }));

    expect(deleteMutate).toHaveBeenCalledWith("page_1", expect.anything());
  });

  it("409 from mutateAsync keeps edit mode open and shows the conflict alert", async () => {
    mutateAsync.mockRejectedValue(new APIError(409, "conflict"));
    renderDetail();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(/changed by someone else/i),
    );
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toBeInTheDocument();
  });
});
